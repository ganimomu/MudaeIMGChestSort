let token;
let grabData;
let url = "https://api.imgchest.com/v1/post/"

document.getElementById("txtApi").addEventListener("change", () => {
    token = document.getElementById("txtApi").value.trim(); console.log(token);
})
document.getElementById("btnGrab").addEventListener("click", grab);

function copy() {
    let box = document.getElementById("txtOut");

    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value);

}

function grab() {
    let albumField = document.getElementById("txtLink");
    if(!token) {
        return alert("Token not set");
    }
    if (!albumField.value.trim()) {
        return alert("Album URL not set");
    }
    let albumId = albumField.value;
    console.log(albumId);
    
    if(albumId.indexOf("h") == 0) {
        albumId = albumId.slice(23)
    } else {        
        albumId= albumId.slice(15)
    }
    console.log(albumId);
    
    fetch(url+albumId, {
        headers: {
            "Authorization": token,
            "Access-Control-Request-Method": "GET, OPTIONS",
            "ccess-Control-Allow-Methods": "*",
            "Access-Control-Allow-Origin": "origin",
            "Access-Control-Allow-Credentials": true
        }
    }).then(response => {
        if(!response.ok){
            console.log(response);            
            return alert("Something went wrong.")
        }
        return response.json();
    }).then(data => {
        console.log(data);
        grabData = data;
    }).catch(error => {
        console.log("Error: ", error);        
    })

    console.log(grabData);
    

}
