# Mudae custom images grabber

This app is developed to ease the addition of custom images to characters within the Discord game bot "Mudae". Set up an album for your wanted character and feed the images all at once with the link grabber and separator

## Usage

Usage is simple, only previous requirement is to have an account already created and provide both album URL (assuming photos been uploaded in mass) and an API key which shortcut is available within the app.
- Paste API token
- Paste Album URL
+ Get your images linked one by one and already separated by Mudae's default separator, "$"

## Uploader

The **Uploader** tab lets you skip the IMG Chest website entirely:

- Drop, pick or paste images in (almost) any format. Each one is converted to PNG in the browser, since PNG is the format the bot accepts. Nothing is sent anywhere except the finished PNGs.
- Press **Upload**. The images become one new IMG Chest post (title / privacy / NSFW are optional settings; IMG Chest currently has anonymous uploads disabled, so posts are always tied to your account).
- You get the album URL and the ready-to-paste `link $ link $ link` string right away. The album URL is also placed in the **Grabber** tab.

Notes:
- Converted natively by the browser: JPG, WEBP, GIF (first frame only), BMP, AVIF, ICO, SVG. HEIC/HEIF and TIFF are handled by small decoder libraries that load from jsDelivr the first time one of those files is added (needs internet).
- PNGs already under the size limit are uploaded untouched.
- IMG Chest accepts up to 20 files / 20 MB each per request. Larger selections are uploaded in batches of 20 to the same post, and PNGs over 20 MB are shrunk automatically (can be switched off).
- If a batch fails halfway (rate limit, connection), the button turns into **Retry remaining** and appends the rest to the same post.

Files: `app.js` (shared helpers + Grabber), `converter.js` (any image to PNG), `uploader.js` (Uploader tab).

***

At the moment, the app only works with IMGChest service (IMGUR probably won't be implemented in any near) and requires you to provide your own API key to be able to use it. Alternatives can be made to provide an API key directly from the app but giving the user the option to provide it's own API key would avoid hitting IMGChest API rate limits in rare occasions.
API key is never saved on application but is saved on local browser, allowing the user to set up and forget once they got their own key as long it stays within the same browser

Additionally, app could be used for any other purpose outside of Mudae as it is, in simple words, a link grabber. Only thing making it "Mudae" specific is the way links are separated with "$", since it's the default separator for the bot and lets users paste that directly into a command and be done with it.
But in practice, it eases the job of uploading multiple images at once and having to copy each image individually, since it compiles everything into a long string of links.
 
