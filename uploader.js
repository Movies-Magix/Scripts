import fs from "fs";
import 'dotenv/config';
import { createHash } from "crypto";
import { execSync } from "child_process";
import { recursiveDelete } from "./config.js";

if (!fs.existsSync(".env")) {
    console.log("[!]: Unable to locate '.env' file!");
    console.log('Exiting...');
    process.exit();
}

const workDir = "Streams"
const mvs = fs.readdirSync(workDir);

for (const mv of mvs) {
    console.log(`Preparing to upload '${mv}'....`);
    const md5 = createHash('md5').update(mv).digest('hex');
    const sha256 = createHash('sha256').update(mv).digest('hex');
    const randomIDF = `${md5.substring(0, 4)}${String(Date.now()).split('')
        .reverse().join('').substring(0, 4)}${sha256.substring(0, 4)}`.toLowerCase();

    try {
        const fromLOC = `${workDir}/${mv}`;
        const projNM = `${randomIDF.toLowerCase()}-${mv.toLowerCase()}`;
        console.log(`Creating CloudFlare Pages project '${projNM}'....`);
        execSync(`npx wrangler pages project create --project-name "${projNM}" --production-branch "prod"`, { encoding: 'utf-8' });
        console.log(`Uploading static assets to '${projNM}.pages.dev' from '${fromLOC}'....`);
        execSync(`npx wrangler pages deploy "${fromLOC}" --project-name "${projNM}" --commit-message "for ${mv}"`, { encoding: 'utf-8' });
        console.log(`Successfully uploaded movie '${mv}', hosted at 'https://${projNM}.pages.dev/'`);
        console.log(`Clearing asset files from '${fromLOC}'....`);
        recursiveDelete(fromLOC);
        console.log('Task Finished!');
        console.log("-------------\n");
    }
    catch (er) {
        console.error('Error:', er.stderr ? er.stderr.toString() : er.toString());
        console.log(`\nPlease verify that account-id & api-token are correct and executed in cell.
        Don't use 'Global API Key' or 'Origin CA Key' rather create new one with 'Edit Cloudflare Workers' template!`);
    }
}
