import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import Busboy from 'busboy';
import config from './config/index.js';
import { createId } from './utils.js';

const {
    UPLOADS_DIR,
    UPLOADS_URL_PREFIX,
    MAX_UPLOAD_FILES,
    MAX_UPLOAD_FILE_SIZE
} = config;

export function sanitizeUploadExtension(filename) {
    if (!filename || typeof filename !== 'string') return '';
    const ext = path.extname(filename).toLowerCase();
    if (!ext) return '';
    return ext.replace(/[^a-z0-9.]/g, '');
}

export function getUploadPublicUrl(filename) {
    return `${UPLOADS_URL_PREFIX}/${filename}`;
}

export async function handleMultipartUpload(req) {
    return new Promise((resolve, reject) => {
        const files = [];
        const fields = {};
        const pendingWrites = [];
        try {
            const busboy = Busboy({
                headers: req.headers,
                limits: {
                    files: MAX_UPLOAD_FILES,
                    fileSize: MAX_UPLOAD_FILE_SIZE
                }
            });

            busboy.on('field', (name, value) => {
                if (!name) return;
                fields[name] = value;
            });

            busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
                if (!filename) {
                    file.resume();
                    return;
                }
                const safeExt = sanitizeUploadExtension(filename);
                const uniqueName = `${createId('upload')}${safeExt || ''}`;
                const destination = path.join(UPLOADS_DIR, uniqueName);
                let bytesWritten = 0;
                const writeStream = createWriteStream(destination);

                file.on('data', (chunk) => {
                    bytesWritten += chunk.length;
                });

                const writePromise = pipeline(file, writeStream)
                    .then(() => {
                        files.push({
                            id: uniqueName,
                            field: fieldname,
                            originalName: filename,
                            mimeType: mimetype,
                            encoding,
                            size: bytesWritten,
                            url: getUploadPublicUrl(uniqueName),
                            _localPath: destination
                        });
                    })
                    .catch((error) => {
                        reject(error);
                    });

                pendingWrites.push(writePromise);
            });

            busboy.on('filesLimit', () => {
                reject(new Error('files-limit-exceeded'));
            });

            busboy.on('error', (error) => {
                reject(error);
            });

            busboy.on('finish', () => {
                Promise.all(pendingWrites)
                    .then(() => resolve({ files, fields }))
                    .catch(reject);
            });

            req.pipe(busboy);
        } catch (error) {
            reject(error);
        }
    });
}
