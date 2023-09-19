import fs from "fs";
import fetch from "node-fetch";
import Downloader from "nodejs-file-downloader";
import { headers, recursiveDelete } from "./config.js";

if (!RegExp.escape)
	RegExp.escape = (string) =>
	string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

process.on("message", async (msg) => {
	const allSegs = [];
	const myId = msg.ID;
	const m3u8Uri = msg.Uri;
	const movName = msg.Name;

	if (msg.Type == 'Stop') {
		console.log("Other instance errored");
		return cleanup(movName, myId)
	}

	if (msg.Type !== 'Start') return;
	const workDir = `${movName}-${myId}`;
	const m3u8TextResp = await (await fetch(m3u8Uri, { headers })).text();
	let proccessedM3U8Txt = "";

	m3u8TextResp.split("\n").forEach(hlsSegs => {
		if (hlsSegs.includes(".ts")) allSegs.push(hlsSegs);
		if (!hlsSegs.includes(".key")) return;

		const keyMatch = /URI="([^"]+)"/.exec(hlsSegs);
		const encUrl = keyMatch[1];
		if (!keyMatch || !encUrl) return;
		// Following code will be executed only once

		new Downloader({
			directory: workDir,
			maxAttempts: 3,
			url: encUrl,
			headers
		}).download();

		const baseRegex = /^(.*?\/(?:[^\/]*\/)*)/;
		const queryRegex = /\?(.*)$/;
		let bStr = "", qStr = "";

		const baseMatch = baseRegex.exec(encUrl);
		const queryMatch = queryRegex.exec(encUrl);
		if (baseMatch && baseMatch[1]) bStr = baseMatch[1];
		if (queryMatch && queryMatch[1]) qStr = "?" + queryMatch[1];

		proccessedM3U8Txt = m3u8TextResp
			.replace(new RegExp(RegExp.escape(bStr), "g"), "")
			.replace(new RegExp(RegExp.escape(qStr), "g"), "");
	});

	if (fs.existsSync(workDir)) {
		fs.rmSync(workDir, {
			recursive: true,
			force: true
		});
	}

	fs.mkdirSync(workDir);
	let threads = msg.Threads, errored = false,
	lim = Math.trunc(allSegs.length / threads) + 1;
	process.send({ Type: 'Total', Value: allSegs.length });
	fs.writeFileSync(`${workDir}/${movName}.m3u8`, proccessedM3U8Txt);

	for (let j = 0; j < lim; j++) {
		const iF = j * threads, dlQueue = [],
		dFiles = allSegs.slice(iF, iF + threads);

		dFiles.forEach(hfile => {
			dlQueue.push((new Downloader({
				onBeforeSave: () => process.send({ Type: 'Progress' }),
				directory: workDir,
				maxAttempts: 3,
				url: hfile,
				headers
			})).download())
		});

		try { await Promise.all(dlQueue); }
		catch (er) {
			console.log("\nError resolving batch Download\n", er);
			errored = true;
			break;
		}
	}
	
	if (errored) return cleanup(movName, myId);
	process.send({ Type: 'Done' });
});

function cleanup(mv, id) {
	process.send({ Type: 'Error' });
	recursiveDelete(`./${mv}-${id}`);
	process.exitCode = 1;
}
