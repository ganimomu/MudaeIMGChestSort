let token;
if (localStorage.getItem("apiKey")) {
    token = localStorage.getItem("apiKey");
    document.getElementById("txtApi").value = token;
}
let grabData;
let url = "https://api.imgchest.com/v1/post/"
let output = "";
const toast = document.getElementById('liveToast');
const toastText = document.getElementById('toastBody');

document.getElementById("txtApi").addEventListener("change", () => {
    token = document.getElementById("txtApi").value.trim(); console.log(token);
})
document.getElementById("btnGrab").addEventListener("click", grab);
document.getElementById("btnCopy").addEventListener("click", copy);

function copy() {
    const toastBootstrap = bootstrap.Toast.getOrCreateInstance(toast)
    let box = document.getElementById("txtOut");

    box.select();
    box.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(box.value);
    toastText.innerHTML = "Text copied to clipboard";
    toastBootstrap.show()
}

function grab() {
    const toastBootstrap = bootstrap.Toast.getOrCreateInstance(toast)
    let albumField = document.getElementById("txtLink");
    if (!token) {
        toastText.innerHTML = "API Token not set";
        toastBootstrap.show()
        return
    }
    if (!albumField.value.trim()) {
        toastText.innerHTML = "Album URL not set";
        toastBootstrap.show()
        return
    }
    let albumId = albumField.value;
    console.log(albumId);

    if (albumId.indexOf("h") == 0) {
        albumId = albumId.slice(23)
    } else {
        albumId = albumId.slice(15)
    }
    console.log(albumId);

    fetch(url + albumId, {
        mode: "cors",
        headers: {
            "Authorization": "Bearer " + token
        }
    }).then(response => {
        if (!response.ok) {
            console.log(response);
            return alert("Something went wrong.")
        }
        if (response.ok) {
            localStorage.setItem("apiKey", token);
        }
        return response.json();
    }).then(data => {
        console.log(data);
        grabData = data;
        output="";
        grabData.data.images.forEach(element => {
            if (element) {

                output += element.link + " $ ";
            }
        });
        output = output.slice(0, output.length - 3);
        document.getElementById("txtOut").value = output; 
        document.getElementById("divCopy").removeAttribute("hidden");
    }).catch(error => {
        console.log("Error: ", error);
    })


}
