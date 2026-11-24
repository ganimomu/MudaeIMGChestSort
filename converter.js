// ---------------------------------------------------------------------------
// Any image -> PNG, entirely in the browser.
//
//  1. Already a PNG within the size limit  -> passed through untouched.
//  2. Anything the browser can decode      -> drawn on a canvas, exported as PNG
//     (JPG, WEBP, GIF*, BMP, AVIF, ICO, SVG...)       *first frame only
//  3. Formats browsers can't decode        -> a decoder library is loaded on demand
//     (HEIC/HEIF via heic-to, TIFF via UTIF)
//
// Detection uses the file's first bytes, not its extension, so mislabelled or
// extension-less files still work.
// ---------------------------------------------------------------------------
const Converter = (() => {
    const MAX_BYTES = 19.5 * 1024 * 1024;   // IMG Chest allows 20 MB per file; keep a margin
    const MAX_SIDE = 16384;                 // canvas limit in Chromium
    const MAX_PIXELS = 120e6;

    // heic-to bundles a current libheif (1.23.x). The older heic2any fails on iOS 18+ photos.
    const HEIC_SRC = "https://cdn.jsdelivr.net/npm/heic-to@1.6.6/dist/iife/heic-to.js";
    const TIFF_SRC = "https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js";

    // ---- format sniffing ---------------------------------------------------
    const ascii = (b, from, to) => String.fromCharCode(...b.slice(from, to));
    const isPng = b => b[0] === 0x89 && ascii(b, 1, 4) === "PNG";
    const isTiff = b => (ascii(b, 0, 2) === "II" && b[2] === 0x2A && b[3] === 0) ||
        (ascii(b, 0, 2) === "MM" && b[2] === 0 && b[3] === 0x2A);
    const isHeic = b => ascii(b, 4, 8) === "ftyp" &&
        ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(ascii(b, 8, 12));
    const isSvgName = name => /\.svg$/i.test(name);

    // ---- lazy script loading -------------------------------------------------
    const loading = {};
    function loadScript(src) {
        if (!loading[src]) {
            loading[src] = new Promise((resolve, reject) => {
                const s = document.createElement("script");
                s.src = src;
                s.onload = resolve;
                s.onerror = () => {
                    delete loading[src];
                    reject(new Error("Couldn't load the decoder for this format (offline?)."));
                };
                document.head.appendChild(s);
            });
        }
        return loading[src];
    }

    // ---- decoding ------------------------------------------------------------
    // Every decoder resolves to { source, width, height } where source is
    // something ctx.drawImage() accepts.
    function decodeViaImg(blob) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                // SVGs without intrinsic size report 0
                resolve({ source: img, width: img.naturalWidth || 1024, height: img.naturalHeight || 1024 });
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("undecodable")); };
            img.src = url;
        });
    }

    async function decodeNative(blob) {
        try {
            const bmp = await createImageBitmap(blob);
            return { source: bmp, width: bmp.width, height: bmp.height };
        } catch (e) {
            return decodeViaImg(blob); // SVG and a few others only work through <img>
        }
    }

    async function decodeHeic(file) {
        await loadScript(HEIC_SRC);
        // The IIFE build exposes the global `HeicTo` (callable itself, also as .heicTo)
        const heicTo = typeof window.HeicTo === "function" ? window.HeicTo : window.HeicTo && window.HeicTo.heicTo;
        if (!heicTo) throw new Error("HEIC decoder loaded but isn't usable.");
        let out;
        try {
            out = await heicTo({ blob: file, type: "image/png" });
        } catch (e) {
            const reason = (e && (e.message || e.code)) || String(e);
            throw new Error(`Couldn't decode this HEIC/HEIF file (${reason}).`);
        }
        return decodeNative(Array.isArray(out) ? out[0] : out);
    }

    async function decodeTiff(file) {
        await loadScript(TIFF_SRC);
        try {
            const buf = await file.arrayBuffer();
            const ifds = window.UTIF.decode(buf);
            const page = ifds[0];
            window.UTIF.decodeImage(buf, page);
            const rgba = window.UTIF.toRGBA8(page);
            const canvas = document.createElement("canvas");
            canvas.width = page.width;
            canvas.height = page.height;
            canvas.getContext("2d").putImageData(
                new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), page.width, page.height), 0, 0);
            return { source: canvas, width: page.width, height: page.height };
        } catch (e) {
            throw new Error("Couldn't decode this TIFF file.");
        }
    }

    // ---- encoding ------------------------------------------------------------
    function encodePng(decoded, scale) {
        const w = Math.max(1, Math.round(decoded.width * scale));
        const h = Math.max(1, Math.round(decoded.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(decoded.source, 0, 0, w, h);
        return new Promise((resolve, reject) =>
            canvas.toBlob(blob => blob
                ? resolve({ blob, width: w, height: h })
                : reject(new Error("Couldn't export this image as PNG (is it extremely large?).")), "image/png"));
    }

    const mb = bytes => (bytes / 1024 / 1024).toFixed(1) + " MB";

    // ---- public API ------------------------------------------------------------
    // Resolves to { blob, note, width?, height? }. Throws Error with a readable message.
    async function toPng(file, { autoShrink = true } = {}) {
        const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

        if (isPng(head) && file.size <= MAX_BYTES) {
            return { blob: file, note: "Already PNG, kept as is" };
        }

        let input = file;
        if (isSvgName(file.name) && file.type !== "image/svg+xml") {
            input = new Blob([file], { type: "image/svg+xml" });
        }

        // Native first (Safari can even do HEIC/TIFF), library as fallback
        let decoded;
        try {
            decoded = await decodeNative(input);
        } catch (e) {
            if (isHeic(head)) decoded = await decodeHeic(file);
            else if (isTiff(head)) decoded = await decodeTiff(file);
            else throw new Error("Unsupported or corrupt image file.");
        }

        // Stay inside what a canvas can hold
        let scale = Math.min(1, MAX_SIDE / Math.max(decoded.width, decoded.height),
            Math.sqrt(MAX_PIXELS / (decoded.width * decoded.height)));

        let result = await encodePng(decoded, scale);
        const resized = scale < 1;
        let shrunkForSize = false;
        while (result.blob.size > MAX_BYTES) {
            if (!autoShrink) throw new Error(`PNG is ${mb(result.blob.size)}, over IMG Chest's 20 MB limit.`);
            if (scale < 0.15) throw new Error("Couldn't get this image under 20 MB.");
            scale *= 0.8;
            shrunkForSize = true;
            result = await encodePng(decoded, scale);
        }
        if (decoded.source.close) decoded.source.close(); // free ImageBitmap memory

        const notes = [];
        notes.push(isPng(head) ? "PNG re-encoded" : "Converted to PNG");
        if (shrunkForSize) notes.push(`downscaled to ${result.width}×${result.height} to fit 20 MB`);
        else if (resized) notes.push(`downscaled to ${result.width}×${result.height} (too large for a canvas)`);
        if (head[0] === 0x47 && ascii(head, 0, 3) === "GIF") notes.push("first frame only");
        return { blob: result.blob, note: notes.join(", "), width: result.width, height: result.height };
    }

    // "My Photo.JPG" -> "My Photo.png"
    function pngName(name) {
        const base = name.replace(/\.[^./\\]+$/, "") || "image";
        return base + ".png";
    }

    return { toPng, pngName, MAX_BYTES };
})();
