// ---------------------------------------------------------------------------
// Uploader tab: pick/drop/paste images -> convert to PNG -> upload as a new
// IMG Chest post -> show the Mudae-formatted links and feed the album URL
// to the Grabber tab.
// ---------------------------------------------------------------------------
(() => {
    const { POST_URL_BASE, getToken, rememberToken, showToast, copyFrom,
        apiRequest, formatLinks, setGrabberUrl, showTab } = window.MudaeApp;

    const FILES_PER_REQUEST = 20;   // IMG Chest limit per request (free accounts)
    const $ = id => document.getElementById(id);

    const dropZone = $("dropZone");
    const fileInput = $("fileInput");
    const fileList = $("fileList");
    const btnUpload = $("btnUpload");
    const btnClear = $("btnClear");

    // item: { id, file, outName, status, blob, thumb, note, error }
    // status: queued | converting | ready | error | uploaded
    let items = [];
    let nextId = 1;
    let convertQueue = Promise.resolve();
    let uploading = false;
    // Set once a post exists but some files didn't make it, so "Upload" again
    // appends the remaining files to that same post instead of creating another.
    let activePostId = null;

    const fmtSize = bytes => bytes >= 1048576
        ? (bytes / 1048576).toFixed(1) + " MB"
        : Math.max(1, Math.round(bytes / 1024)) + " KB";

    // ---- adding files --------------------------------------------------------
    function addFiles(fileListLike) {
        const files = Array.from(fileListLike || []);
        if (!files.length) return;
        for (const file of files) {
            const item = { id: nextId++, file, outName: Converter.pngName(file.name || "image"), status: "queued" };
            items.push(item);
            convertQueue = convertQueue.then(() => convertItem(item));
        }
        render();
    }

    async function convertItem(item) {
        if (!items.includes(item)) return; // removed while waiting
        item.status = "converting";
        render();
        try {
            const result = await Converter.toPng(item.file, { autoShrink: $("chkShrink").checked });
            if (!items.includes(item)) return;
            item.blob = result.blob;
            item.note = result.note;
            item.thumb = URL.createObjectURL(result.blob);
            item.status = "ready";
        } catch (e) {
            if (!items.includes(item)) return;
            item.status = "error";
            item.error = e.message || "Conversion failed";
        }
        render();
    }

    function removeItem(item) {
        if (item.thumb) URL.revokeObjectURL(item.thumb);
        items = items.filter(i => i !== item);
        render();
    }

    function clearAll() {
        items.forEach(i => i.thumb && URL.revokeObjectURL(i.thumb));
        items = [];
        activePostId = null;
        $("upResult").hidden = true;
        render();
    }

    // ---- rendering -----------------------------------------------------------
    const STATUS_LABEL = {
        queued: ["Waiting", "secondary"],
        converting: ["Converting…", "info"],
        ready: ["Ready", "success"],
        error: ["Error", "danger"],
        uploaded: ["Uploaded", "primary"]
    };

    function render() {
        fileList.replaceChildren(...items.map(renderItem));

        const readyCount = items.filter(i => i.status === "ready").length;
        const busyConverting = items.some(i => i.status === "queued" || i.status === "converting");
        btnUpload.disabled = uploading || busyConverting || readyCount === 0;
        btnUpload.textContent = activePostId
            ? `Retry remaining (${readyCount})`
            : (readyCount ? `Upload ${readyCount} image${readyCount === 1 ? "" : "s"}` : "Upload");
        btnClear.disabled = uploading || items.length === 0;
    }

    function renderItem(item) {
        const li = document.createElement("li");

        const thumb = item.thumb ? document.createElement("img") : document.createElement("span");
        thumb.className = "thumb" + (item.thumb ? "" : " empty");
        if (item.thumb) { thumb.src = item.thumb; thumb.alt = ""; }

        const info = document.createElement("div");
        info.className = "info";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = item.outName;
        name.title = item.file.name;
        const meta = document.createElement("div");
        meta.className = "meta" + (item.status === "error" ? " error" : "");
        if (item.status === "error") {
            meta.textContent = item.error;
        } else {
            const size = item.blob ? fmtSize(item.blob.size) : fmtSize(item.file.size);
            meta.textContent = item.note ? `${size} · ${item.note}` : size;
        }
        info.append(name, meta);

        const [label, color] = STATUS_LABEL[item.status];
        const badge = document.createElement("span");
        badge.className = `badge text-bg-${color}`;
        badge.textContent = label;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn-close";
        remove.setAttribute("aria-label", "Remove " + item.file.name);
        remove.disabled = uploading;
        remove.addEventListener("click", () => removeItem(item));

        li.append(thumb, info, badge, remove);
        return li;
    }

    // ---- uploading -----------------------------------------------------------
    function setProgress(done, total, text) {
        $("upProgress").hidden = false;
        $("upBar").style.width = (total ? Math.round(done / total * 100) : 0) + "%";
        $("upStatus").textContent = text;
    }

    function chunk(arr, size) {
        const out = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    }

    async function upload() {
        if (uploading) return;
        if (!getToken()) return showToast("API Token not set");
        const pending = items.filter(i => i.status === "ready");
        if (!pending.length) return showToast("Nothing ready to upload yet");

        uploading = true;
        $("upResult").hidden = true;
        render();

        const batches = chunk(pending, FILES_PER_REQUEST);
        let lastPost = null;
        let usedAdd = activePostId !== null;
        let sent = 0;

        try {
            for (let b = 0; b < batches.length; b++) {
                setProgress(sent, pending.length,
                    `Uploading batch ${b + 1} of ${batches.length} (${batches[b].length} image${batches[b].length === 1 ? "" : "s"})…`);

                const form = new FormData();
                if (!activePostId) {
                    const title = $("txtTitle").value.trim();
                    if (title) form.append("title", title);
                    form.append("privacy", $("selPrivacy").value);
                    if ($("chkNsfw").checked) form.append("nsfw", "true");
                }
                batches[b].forEach(it => form.append("images[]", it.blob, it.outName));

                const res = await apiRequest(activePostId ? `/post/${activePostId}/add` : "/post",
                    { method: "POST", body: form });
                if (activePostId) usedAdd = true;
                lastPost = res.data;
                activePostId = lastPost.id;
                rememberToken();

                batches[b].forEach(it => { it.status = "uploaded"; });
                sent += batches[b].length;
                render();
            }

            // With more than one request, fetch the finished post so the list is
            // complete and in album order regardless of what /add returns.
            let images = lastPost.images;
            if (usedAdd) {
                try {
                    images = (await apiRequest("/post/" + lastPost.id)).data.images;
                } catch (e) { /* fall back to the last response */ }
            }

            const albumUrl = POST_URL_BASE + lastPost.id;
            $("txtUpAlbum").value = albumUrl;
            $("lnkAlbum").href = albumUrl;
            $("txtUpOut").value = formatLinks(images);
            $("upResult").hidden = false;
            setGrabberUrl(albumUrl);
            setProgress(pending.length, pending.length, `Done: ${pending.length} image${pending.length === 1 ? "" : "s"} uploaded.`);
            $("upBar").classList.remove("progress-bar-animated");
            activePostId = null;
            showToast("Upload complete. Album URL sent to the Grabber tab.");
        } catch (e) {
            const remaining = pending.length - sent;
            if (activePostId) {
                showToast(`${e.message} ${sent} uploaded, ${remaining} left. Press the button again to add the rest to the same post.`);
            } else {
                showToast(e.message);
            }
            setProgress(sent, pending.length, "Upload stopped.");
        } finally {
            uploading = false;
            render();
        }
    }

    // ---- wiring ----------------------------------------------------------------
    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });

    ["dragenter", "dragover"].forEach(ev => dropZone.addEventListener(ev, e => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach(ev => dropZone.addEventListener(ev, e => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
    }));
    dropZone.addEventListener("drop", e => addFiles(e.dataTransfer.files));

    // Paste images from the clipboard while the Uploader tab is open
    document.addEventListener("paste", e => {
        if ($("panel-uploader").hidden) return;
        const files = e.clipboardData && e.clipboardData.files;
        if (files && files.length) addFiles(files);
    });

    btnUpload.addEventListener("click", upload);
    btnClear.addEventListener("click", clearAll);
    $("btnCopyLinks").addEventListener("click", () => copyFrom($("txtUpOut")));
    $("btnCopyAlbum").addEventListener("click", () => copyFrom($("txtUpAlbum")));
    $("btnToGrabber").addEventListener("click", () => showTab("grabber"));

    render();
})();
