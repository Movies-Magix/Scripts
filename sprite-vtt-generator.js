import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import moment from 'moment';
import path from 'path';

export class SpriteGenerator {
    constructor(options) {
        var _a, _b, _c;
        this.rowCount = 5;
        this.colCount = 5;
        this.height = 90;
        this.width = 160;
        this.multiple = false;
        this.webVTTRequired = false;
        this.thumbnailPrefix = 'thumbs';

        if (((_a = options === null || options === void 0 ? void 0 : options.webVTT) === null || _a === void 0 ? void 0 : _a.required) === true &&
        ((_b = options === null || options === void 0 ? void 0 : options.webVTT) === null || _b === void 0 ? void 0 : _b.path) === undefined) throw new Error('WEBVTT path not found');
        
        if ((_c = options === null || options === void 0 ? void 0 : options.webVTT) === null || _c === void 0 ? void 0 : _c.required) {
            this.webVTTPath = options.webVTT.path;
            this.webVTTRequired = true;
        }

        this.outputDir = options.outputDir;
        this.inputPath = options.inputPath;
        this.rowCount = options.rowCount || this.rowCount;
        this.colCount = options.colCount || this.colCount;
        this.multiple = options.multiple || this.multiple;
        this.height = options.height || this.height;
        this.width = options.width || this.width;
        this.interval = options.interval || undefined;
        this.thumbnailPrefix = options.thumbnailPrefix || this.thumbnailPrefix;
    }

    getFPS() {
        const defaultFps = 24;

        return new Promise((resolve, reject) => {
            ffmpeg(this.inputPath).ffprobe((err, data) => {
                if (err) reject(err);
                const videoStream = data.streams[0];
                const fpsString = (videoStream === null || videoStream === void 0 ? void 0 : videoStream.r_frame_rate) || (videoStream === null || videoStream === void 0 ? void 0 : videoStream.avg_frame_rate);
                
                if (!fpsString) {
                    resolve(defaultFps);
                    return;
                }
                
                const [numerator, denominator] = fpsString.split('/');
                
                if (Number(numerator) && Number(denominator)) {
                    const fps = Math.round(Number(numerator) / Number(denominator));
                    resolve(fps);
                }
                
                resolve(defaultFps);
            });
        });
    }

    getDuration() {
        return new Promise((resolve, reject) => {
            ffmpeg(this.inputPath).ffprobe((err, data) => {
                if (err) reject(err);
                const { duration } = data.format;
                if (Number(duration)) resolve(Number(duration));
                resolve(0);
            });
        });
    }

    async generate() {
        const inputExists = await fs.pathExists(this.inputPath);
        if (!inputExists) throw new Error('Input file not found');
        const interval = await this.getOptimalInterval();
        const dyn = this.multiple ? "-%d" : "";
        await fs.ensureDir(this.outputDir);

        if (!this.multiple) {
            const duration = await this.getDuration();
            if (duration === 0) throw new Error('Could not fetch duration from video');
            const totalImages = Math.floor(duration / interval);
            this.rowCount = Math.floor(totalImages / this.colCount) + 1;
        }

        const fps = await this.getFPS();
        const outputDirPath = path.join(this.outputDir, `${this.thumbnailPrefix}${dyn}.jpg`);
        const complexFilter = `select='not(mod(n,${fps * interval}))',scale=${this.width}:${this.height},tile=${this.colCount}x${this.rowCount}`;
        
        return new Promise((resolve, reject) => {
            const ffDoer = ffmpeg(this.inputPath).complexFilter(complexFilter).outputOption(['-vsync', 'vfr', '-an']).output(outputDirPath);
            ffDoer.on('start', () => console.log('Starting thumbnail sprite generation...'));
            
            ffDoer.on('end', () => {
                console.log('Sprite generated!');

                if (this.webVTTRequired) {
                    console.log('Generating WEBVTT file');

                    this.generateWebVTT().then(() => {
                        console.log('WebVTT generated successfully.');
                        resolve();
                    });
                }
                else {
                    console.log('Skipping WEBVTT generation.');
                    resolve();
                }
            })

            ffDoer.on('error', err => {
                console.error('Error Encountered:', err);
                reject(err);
            });
            
            ffDoer.run();
        });
    }

    async generateWebVTT() {
        if (!this.webVTTPath || !this.webVTTRequired) return;
        if (this.webVTTPath.split('.').pop() !== 'vtt')
            throw new Error("WEBVTT path must be a '.vtt' file");

        let row = this.rowCount;
        const col = this.colCount;
        let thumbOutput = 'WEBVTT\n\n';
        const duration = await this.getDuration();
        const interval = await this.getOptimalInterval();
        const totalImages = Math.floor(duration / interval);
        const startTime = moment('00:00:00', 'HH:mm:ss.SSS');
        const endTime = moment('00:00:00', 'HH:mm:ss.SSS').add(interval, 'seconds');

        if (!this.multiple) {
            row = Math.floor(totalImages / this.colCount) + 1;

            for (let i = 0; i < row; i++) {
                for (let j = 0; j < col; j++) {
                    const currentImageCount = i * col + j;
                    if (currentImageCount > totalImages) break;
                    thumbOutput += `${startTime.format('HH:mm:ss.SSS')} --> ${endTime.format('HH:mm:ss.SSS')}\n`;
                    thumbOutput += `${this.thumbnailPrefix}.jpg#xywh=${j * this.width},${i * this.height},${this.width},${this.height}\n\n`;
                    startTime.add(interval, 'seconds');
                    endTime.add(interval, 'seconds');
                }
            }
        }
        else {
            const spritesNo = Math.ceil(duration / interval / (row * col));

            for (let k = 0; k < spritesNo; k++) {
                for (let i = 0; i < row; i++) {
                    for (let j = 0; j < col; j++) {
                        const currentImageCount = k * row * col + i * col + j;
                        if (currentImageCount > totalImages) break;
                        thumbOutput += `${startTime.format('HH:mm:ss.SSS')} --> ${endTime.format('HH:mm:ss.SSS')}\n`;
                        thumbOutput += `${this.thumbnailPrefix}-${k + 1}.jpg#xywh=${j * this.width},${i * this.height},${this.width},${this.height}\n\n`;
                        startTime.add(interval, 'seconds');
                        endTime.add(interval, 'seconds');
                    }
                }
            }
        }

        fs.writeFileSync(this.webVTTPath, thumbOutput);
    }

    async getOptimalInterval() {
        if (this.interval) return this.interval;
        const duration = await this.getDuration();

        if (duration < 120) return 1;
        if (duration < 300) return 2;
        if (duration < 600) return 3;
        if (duration < 1800) return 4;
        if (duration < 3600) return 5;
        if (duration < 7200) return 10;
        if (duration < 9200) return 15;
        if (duration < 10800) return 30;
        if (duration < 21600) return 60;
        return 120;
    }
}
