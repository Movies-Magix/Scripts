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
    console.log("Invalid args supplied to muxer");
    console.log("Exiting...");
    process.exit();
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

            for (const stream of probeData.streams) {
                const isAudStm = stream.codec_type === "audio";
                const isVidStm = stream.codec_type === "video";
                const cmpFactor = isVidStm ? 0.9 : isAudStm ? 1.0 : 0.0;

                if (isVidStm) {
                    if (m3u8Data[level]["h"] !== 0) return;
                    m3u8Data[level]["h"] = stream.height;
                    m3u8Data[level]["w"] = stream.width;
                }

                const bitRate = stream.bit_rate;
                m3u8Data[level]["bw"] += Math.floor(bitRate * cmpFactor);
            }

            const toSegDir = `${baseDir}/${level}/seg.m3u8`;
            console.log(`[FFMPEG]: Muxing '${level}' level of movie '${movie}'...`);
            execSync(`ffmpeg -loglevel quiet -i ${rawPth} -c copy -hls_time 10 -hls_list_size 0 ${toSegDir}`);

            console.log(`Post processing '${toSegDir}'...`); fs.unlinkSync(rawPth);
            const segLines = fs.readFileSync(toSegDir, { encoding: 'utf-8' }).split('\n').map(segLine => segLine.trim());
            segLines.splice(1, 0, '#EXT-X-ALLOW-CACHE:YES', '#EXT-X-PLAYLIST-TYPE:VOD');
            fs.writeFileSync(toSegDir, segLines.join('\n'), { encoding: "utf-8" });
            console.log(`Processing finished for '${toSegDir}'\n`);
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
