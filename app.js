import { headers, recursiveDelete } from "./config.js";
import cProg from "cli-progress";
import proc from "child_process";
import readline from "readline";
import fetch from "node-fetch";
import fs from "fs";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (query) => new Promise((resolve) => rl.question(query, resolve));

const mBar = new cProg.MultiBar({
    clearOnComplete: true,
	hideCursor: false
}, cProg.Presets.shades_grey);

const stmAlias = "Streams";
const vidAlias = "Videos";
const allBars = [];
let movName = "";
let thdCnt = 500;
let procForks;
let curLvl;
let done;

function doExit(msg = "") {
    console.log(`[!]: ${msg}`, '\nExiting...');
    return process.exit();
}

function onDonloaderMSG(msg, id) {
    switch (msg.Type) {
        case "Total": allBars[id] = mBar.create(msg.Value, 0); break;
        case "Progress": if (allBars[id]) allBars[id].increment(); break;

        case "Error":
            mBar.stop();
            procForks[`d${id == 1 ? 2 : 1}`].send('Stop');
            break;
    
        case "Done":
            if (++done !== 2) return;
            if (!fs.existsSync(vidAlias))
                fs.mkdirSync(vidAlias);
            console.log('\n');
            mBar.stop();

            for (let i = 1; i <= 2; i++) { // Two levels
                console.log('\n---------------------------');
                const fromWhere = `"${movName}-${i}/${movName}.m3u8"`;
                console.log(`Decrypting streams from "${movName}-${i}"`);
                proc.execSync(`ffmpeg -loglevel quiet -allowed_extensions ALL -i ${fromWhere} -c copy "${movName}-${i}.mp4"`);
                console.log(`Clearing clutter at ${movName}-${i}....`);
                recursiveDelete(`${movName}-${i}`);
            }

            const { size: fSz1 } = fs.statSync(`${movName}-1.mp4`);
            const { size: fSz2 } = fs.statSync(`${movName}-2.mp4`);
            const is1HD = fSz1 > fSz2;

            [1, 2].forEach(i => {
                let mvLvl = 'hd';
                if (is1HD && i === 2) mvLvl = 'sd';
                if (!is1HD && i === 1) mvLvl = 'sd';
                fs.renameSync(`${movName}-${i}.mp4`,
                    `${vidAlias}/${movName}_${mvLvl}.mp4`)
            });

            setTimeout(startMaster, 4000);
            break;
    }
}

async function startNewLevel(lvlM3U8) {
	let cId = ++curLvl;
	const downloader = proc.fork('downloader.js');
	downloader.on('message', (msg) => onDonloaderMSG(msg, cId));
	procForks[`d${cId}`] = downloader;
	
	downloader.send({
        Threads: thdCnt,
        Name: movName,
        Type: 'Start',
        Uri: lvlM3U8,
        ID: cId
    });
}

async function askUploader() {
    let upAns = await prompt('Start Uploader [y/(n)]? ');
    if (upAns.toLowerCase() !== 'y') return doExit();
    const uploader = proc.fork('uploader.js');
    uploader.on('close', () => doExit(
        "Upload task completed!"
    ));
}

async function askMuxer() {
    if (await prompt("Start Muxing [y/(n)]? ") !== 'y') return doExit();
    console.log('Starting "muxer.js"....');

    const allMovies = new Set();
    const vidDirCnts = fs.readdirSync(vidAlias);

    for (const vidName of vidDirCnts) { // Iterate over all entries of base folder
        const fileQuality = vidName.endsWith("_hd.mp4") ? "hd"
            : vidName.endsWith("_sd.mp4") ? "sd" : null;
        
        if (!fileQuality || fs.lstatSync(`${vidAlias}/${vidName}`).isDirectory()) {
            console.error(`Found invalid content '${vidName}', deleting....`);
            fs.rmSync(`${vidAlias}/${vidName}`, {
                recursive: true,
                force: true
            });

            continue;
        }

        const counterQuality = (fileQuality === "hd") ? "sd" : "hd";
        const movieName = vidName.replace(`_${fileQuality}.mp4`, "");    
        if (allMovies.has(movieName)) continue;

        if (!fs.existsSync(`${vidAlias}/${movieName}_${counterQuality}.mp4`)) {
            console.error(`Counter quality file for ${vidName} not found!`);
            fs.unlinkSync(`${vidAlias}/${vidName}`);
            console.error('File deleted!\n');
            continue;
        }

        allMovies.add(movieName);
    }

    if (allMovies.size === 0) {
        console.log('No valid movies to mux!');
        setTimeout(startMaster, 4000);
        return;
    }

    proc.fork('muxer.js', [...allMovies]).on('close', () => {
        console.log("Muxing task completed!");
        setTimeout(startMaster, 4000);
    });
}

async function startMaster() {
    function deleteIPynbCheckpoints(dir) {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
            const filePath = `${dir}/${file}`;
            if (file === ".ipynb_checkpoints") {
                recursiveDelete(filePath);
                continue;
            }
            
            if (fs.statSync(filePath).isDirectory())
                deleteIPynbCheckpoints(filePath);
        }
    }

    function performDirChecks(onDir) {
        return (fs.existsSync(onDir) && fs.lstatSync(onDir)
            .isDirectory() && fs.readdirSync(onDir).length > 0);
    }

    function validateStreamsStruct(tld) {
        if (!performDirChecks(tld)) return false; // Check if Top-Level-Directory is good to go
        const movies = fs.readdirSync(tld); // Movies named directories

        for (const eachMovie of movies) { // Loop through each movie directory for further validations
            const movieDir = `${tld}/${eachMovie}`;
            if (!performDirChecks(movieDir)) return false;

            // Read all entries(files or folders) inside of each movie directory
            const movieDirContents = fs.readdirSync(movieDir);
            if (movieDirContents.length !== 6) return false;
            let nonDirCount = 0, dirCount = 0;

            for (const bname of movieDirContents) {
                const subCnt = `${movieDir}/${bname}`;

                if (fs.lstatSync(subCnt).isDirectory()) {
                    // Check if directory is name is well defined or not
                    if (++dirCount > 3 || !['sd', 'hd', 'thumbnail'].includes(bname)) return false;                    
                    const lastNest = fs.readdirSync(subCnt); // Last nesting level
                    const totalFileIndex = lastNest.length - 1;
                    
                    if (bname === 'thumbnail') {
                        if (lastNest.length !== 2) return false;
                        if (!lastNest.every(v => ['sprite.jpg', 'index.vtt'].includes(v))) return false;
                        continue;
                    }

                    // Inside of ("hd" | "sd") there should be a "seg.m3u8" file
                    if (!lastNest.includes("seg.m3u8")) return false;

                    for (let k = 0; k < totalFileIndex; k++) // Loop to check if all segments of stream are present in continous manner or not
                        if (!fs.existsSync(`${subCnt}/seg-${k}.ts`)) return false;
                }
                else {
                    if (++nonDirCount > 3 ||
                        !["master.m3u8", "_headers", "404.html"]
                            .includes(bname)) return false;
                    // Validate if both files are there with correct names or not
                }
            }

            if (nonDirCount !== 3 || dirCount !== 3)
                return false; // There should be exactly 3 files and 3 folders
        }

        return true;
    }

    async function getCounterM3U8Uri(firstUri = "") {
        const letterMatch = firstUri.match(/_([a-z])\/index/);
        if (!letterMatch || !letterMatch[1]) return doExit("Unparsable sub-playlist!");

        const checkList = ["h", "l", "o", "a", "b", "c", "d", "e", "f", "g", "i", "j", "k",
            "m", "n", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];
        let l = letterMatch[1];

        for (const c of checkList) {
            if (c === l) continue; // Don't process the same url again
            const futUri = firstUri.replace(`_${l}/index`, `_${c}/index`);
            const res = await fetch(futUri, { headers });
            if (res.ok) return futUri;
        }
    }

    deleteIPynbCheckpoints('.');
    console.clear();

    try {
        // Check & ask to start muxer if there's raw '.mp4' files available
		if (performDirChecks(vidAlias) && fs.readdirSync(vidAlias)
            .length % 2 === 0) return askMuxer();

        // Check & ask if we can start the upload process
        if (validateStreamsStruct(stmAlias))
            return askUploader();

        let ans = {
            m3u8Uri: await prompt("Enter 'master.m3u8' streaming url (speedostream): "),
            movName: await prompt("Enter the movie name: ")
        }

        if (!ans.m3u8Uri || !ans.movName)
            return doExit("Empty data supplied!");

        done = 0;
        curLvl = 0;
        procForks = { };
        console.log('Starting downloads....');
        movName = ans.movName.replaceAll(' ', '-');

        const masterM3U8 = await (await fetch(ans.m3u8Uri, { headers })).text();
        const masterMatch = masterM3U8.match(/(https?:\/\/[^\s]+)/);
        const _1stURI = masterMatch ? masterMatch[1] : null;

        if (!_1stURI) return doExit('Unable to parse master playlist!');
        const _2ndURI = await getCounterM3U8Uri(_1stURI);
        for (const uri of [_1stURI, _2ndURI])
            startNewLevel(uri);
	}
    catch (err) {
		console.error(err);
        doExit("\nError in request!");
	}
}

startMaster();
