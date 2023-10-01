import fs from "fs";
import probe from "ffprobe";
import probeStatic from "ffprobe-static";
import { execSync } from "child_process";
import { headerFile, masterTemplate, notFoundTemplate } from "./config.js";

const movies = process.argv.slice(2);
const workDirs = {
    stm: "Streams",
    vid: "Videos"
};

if (movies.length === 0) {
    console.log("[!]: Invalid args supplied to muxer");
    console.log("Exiting...");
    process.exit();
}

function createTimeStr(sec) {
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${h}:${m}:${s}.000`;
}

(async () => {
    for (const movie of movies) {
        const baseDir = `${workDirs.stm}/${movie}`;
        const m3u8Data = {
            hd: {
                bw: 0,
                w: 0,
                h: 0
            },
            sd: {
                bw: 0,
                w: 0,
                h: 0
            }
        }
        
        if (fs.existsSync(baseDir)) {
            console.log(`Folder '${baseDir}' exists!`,
            "\nAssuming it to be proccessed, skipping...");
            continue;
        }

        for (const level of ["hd", "sd"]) {
            fs.mkdirSync(`${baseDir}/${level}`, { recursive: true });
            const rawPth = `${workDirs.vid}/${movie}_${level}.mp4`;
            console.log("[FFPROBE]: Collecting metadata....");
            const probeData = await probe(rawPth,
                { path: probeStatic.path });
            let vidDuration = 0;

            for (const stream of probeData.streams) {
                const isAudStm = stream.codec_type === "audio";
                const isVidStm = stream.codec_type === "video";
                const cmpFactor = isVidStm ? 0.9 : isAudStm ? 1.0 : 0.0;

                if (isVidStm) {
                    vidDuration = parseInt(stream.duration);
                    if (m3u8Data[level]["h"] !== 0) return;
                    m3u8Data[level]["h"] = stream.height;
                    m3u8Data[level]["w"] = stream.width;
                }

                const bitRate = stream.bit_rate;
                m3u8Data[level]["bw"] += Math.floor(bitRate * cmpFactor);
            }

            const toSegDir = `${baseDir}/${level}`;
            const segmentPath = toSegDir + '/seg.m3u8';
            console.log(`[FFMPEG]: Muxing '${level}' level of movie '${movie}'...`);
            execSync(`ffmpeg -loglevel quiet -i "${rawPth}" -c copy -hls_time 10 -hls_segment_filename "${toSegDir}/seg-%d.ts" -hls_list_size 0 "${segmentPath}"`);

            if (level === 'sd') {
                const vttContents = ["WEBVTT"];
                const wdir = `${baseDir}/thumbs`; fs.mkdirSync(wdir);
                console.log(`Generating preview thumbnails for '${movie}' [Can take upto 10 minutes]...`);
                execSync(`ffmpeg -loglevel quiet -i "${rawPth}" -vf "fps=1/5,scale=160:-1" "${wdir}/scene-%d.png"`);
                
                for (let t = 0; t < (vidDuration - 5); t += 5) {
                    vttContents.push('');
                    const timeFrom = createTimeStr(t);
                    const timeTo = createTimeStr(t + 5);
                    vttContents.push(`${timeFrom} --> ${timeTo}`);
                    vttContents.push(`scene-${(t / 5) + 1}.png`);
                }
                
                fs.writeFileSync(`${wdir}/scene.vtt`,
                    vttContents.join('\n'), { encoding: "utf-8" });
            }

            console.log(`Post processing '${segmentPath}'...`); fs.unlinkSync(rawPth);
            const segLines = fs.readFileSync(segmentPath, { encoding: 'utf-8' }).split('\n').map(segLine => segLine.trim());
            segLines.splice(1, 0, '#EXT-X-ALLOW-CACHE:YES', '#EXT-X-PLAYLIST-TYPE:VOD');
            fs.writeFileSync(segmentPath, segLines.join('\n'), { encoding: "utf-8" });
            console.log(`Processing finished for '${segmentPath}'\n`);
        }

        const encoding = 'utf-8';
        let masterData = masterTemplate;

        for (const idf of ["HD", "SD"]) {
            const lvl = idf.toLowerCase();

            masterData = masterData.replace(`{{${idf}_RES}}`, `${m3u8Data[lvl]['w']}x${m3u8Data[lvl]['h']}`)
                .replace(`{{${idf}_BW}}`, `${m3u8Data[lvl]['bw']}`);
        }

        console.log(`Writing asset files to '${baseDir}'...`);
        fs.writeFileSync(`${baseDir}/404.html`, notFoundTemplate, { encoding });
        fs.writeFileSync(`${baseDir}/master.m3u8`, masterData, { encoding });
        fs.writeFileSync(`${baseDir}/_headers`, headerFile, { encoding });
    }
})();
