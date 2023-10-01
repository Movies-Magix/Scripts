import fs from 'fs';
import path from 'path';

function recursiveDelete(dir) {
    if (!fs.existsSync(dir)) return;
    
    fs.readdirSync(dir).forEach((file) => {
        const filePath = path.join(dir, file);
        if (fs.lstatSync(filePath).isDirectory())
            recursiveDelete(filePath);
        else fs.unlinkSync(filePath);
    });

    fs.rmdirSync(dir);
}

const osDet = "(Linux; Android 6.0; Nexus 5 Build/MRA58N)";
const browserDet = "Chrome/116.0.0.0 Mobile Safari/537.36 Edg/116.0.1938.81";
const headers = { "user-agent": `Mozilla/5.0 ${osDet} AppleWebKit/537.36 (KHTML, like Gecko) ${browserDet}` }

const masterTemplate =
`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH={{HD_BW}},RESOLUTION={{HD_RES}}
hd/seg.m3u8
#EXT-X-STREAM-INF:BANDWIDTH={{SD_BW}},RESOLUTION={{SD_RES}}
sd/seg.m3u8
#EXT-X-ENDLIST
`;

const headerFile =
`/*
  access-control-allow-origin: *
  access-control-allow-headers: *
  access-control-allow-methods: GET, HEAD
  access-control-expose-headers: *
  access-control-max-age: 86400
  x-robots-tag: nosnippet, noindex
  x-streaming-platform: Movies-Magix
  x-frame-options: DENY

/master.m3u8
  cache-control: max-age=604800, must-revalidate

/hd/seg.m3u8
  cache-control: max-age=604800, must-revalidate

/hd/*.ts
  cache-control: max-age=14400

/sd/seg.m3u8
  cache-control: max-age=604800, must-revalidate

/sd/*.ts
  cache-control: max-age=14400
`;

const notFoundTemplate =
`<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Document</title>
        <style>
            @import 'https://fonts.googleapis.com/css?family=Inconsolata';
            
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            html { min-height: 100%; }

            body {
                height: 100%;
                overflow: hidden;
                box-sizing: border-box;
                background-color: #031900;
                color: rgba(128, 255, 128, 0.8);
                background-image: radial-gradient(#11581E, #041607);
                text-shadow: 0 0 1ex #33ff33, 0 0 2px rgba(255, 255, 255, 0.8);
                font-family: "Inconsolata", Helvetica, sans-serif;
                background-repeat: no-repeat;
                background-size: cover;
            }

            .noise {
                width: 100%;
                height: 100%;
                position: absolute;
                pointer-events: none;
                background-image: url("https://media.giphy.com/media/oEI9uBYSzLpBK/giphy.gif");
                background-repeat: no-repeat;
                background-size: cover;
                opacity: 0.025;
                z-index: -1;
            }

            .overlay {
                width: 100%;
                height: 100%;
                background: repeating-linear-gradient(180deg, rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, 0.3) 50%, rgba(0, 0, 0, 0) 100%);
                background-size: auto 4px;
                pointer-events: none;
                position: absolute;
                z-index: 1;
            }

            .overlay::before {
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                width: 100%;
                content: "";
                height: 100%;
                background-image: linear-gradient(0deg, transparent 0%, rgba(32, 128, 32, 0.2) 2%, rgba(32, 128, 32, 0.8) 3%, rgba(32, 128, 32, 0.2) 3%, transparent 100%);
                animation: scan 5s linear 0s infinite;
                background-repeat: no-repeat;
                pointer-events: none;
                position: absolute;
                display: block;
            }

            @keyframes scan {
                0% { background-position: 0 -100vh; }
                35%, 100% { background-position: 0 100vh; }
            }

            .terminal {
                text-transform: uppercase;
                box-sizing: inherit;
                position: absolute;
                max-width: 500px;
                padding: 2rem;
            }

            .output {
                padding: 15px 0;
                color: rgba(128, 255, 128, 0.8);
                text-shadow: 0 0 1px rgba(51, 255, 51, 0.4), 0 0 2px rgba(255, 255, 255, 0.8);
            }

            .output::before { content: "> "; }
            .errorcode { color: white; }

            a {
                color: #fff;
                cursor: pointer;
                text-decoration: none;
            }
        </style>
    </head>
    <body style="text-wrap: balance;">
        <div class="noise"></div>
        <div class="overlay"></div>
        <div class="terminal">
            <h1>Error <span class="errorcode">404</span></h1>
            <p class="output">The page you are looking for might have been removed, never existed, had its name changed or is unavailable.</p>
            <p class="output"><a href="https://movies-magix.eu.org/">[Return to the homepage]</a></p>
            <p class="output">Redirecting you to homepage in 30 seconds...</p>
            <p class="output">Good luck!</p>
            <script>setTimeout(() => window.location = "https://movies-magix.eu.org/", 60 * 1000)</script>
        </div>
    </body>
</html>
`;

export {
    headers,
    headerFile,
    masterTemplate,
    recursiveDelete,
    notFoundTemplate
}
