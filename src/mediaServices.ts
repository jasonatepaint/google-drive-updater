/**
 * Created by Jason on 3/7/17.
 */
import * as Promise from 'bluebird';
import * as util from 'util';
import { GoogleDriveClient } from './gDriveClient';
import { PromiseHelper } from './promiseHelper';
import * as fs from "fs";
import * as readDir from 'readdir';
import * as path from 'path';
import * as moment from 'moment';
import { Spinner } from 'cli-spinner';

let config = require('./../config/config.json');

export class MediaServices {

    gDriveClient: any;
    localBasePath: string;
    videoFilterArray: any;

    constructor(localBasePath:string) {
        this.gDriveClient= new GoogleDriveClient();
        this.localBasePath = localBasePath;

        this.videoFilterArray = [];
        config.validFileExtensions.forEach((ext) => {
           this.videoFilterArray.push(util.format("**.%s", ext));
        });
    }

    /**
     * Using the local basePath, files from the google drive account are updated
     * where a local file matches the partial path.
     *
     * This assumes that the gdrive path matches the same flat structure as the local file system
     * @returns {Bluebird<U>}
     */
    updateModifiedDateOnGoogleDriveFiles() {

        let pageCount = 1;

        //Function that will be called for each page of items from google drive
        let processPage = (pageToken) => {
            return this.gDriveClient.getVideoFiles(null, pageToken).then((response) => {

                //process each file
                return Promise.mapSeries(response.files, (file) => {
                    return this.gDriveClient.getFullPath(file).then((gdrivePath) => {

                        let localPath = path.join(this.localBasePath, gdrivePath, file.name);
                        if (!fs.existsSync(localPath))
                            return Promise.resolve();

                        let stat = fs.statSync(localPath);

                        let dtLocal = moment(stat.mtime);
                        let dtCloud = moment(file.modifiedTime);

                        //Only concerned with files that don't match the local file
                        if (!dtCloud.isSame(dtLocal)) {
                            return this.gDriveClient.updateFile(file.id, {
                                modifiedTime: dtLocal.toISOString()
                            }).then((res) => {
                                console.log(file.name);
                            });
                        }
                    });
                }).then(() => {
                    console.log("Processed Page " + pageCount++);
                    return response.nextPageToken === undefined ? null : response.nextPageToken;
                });
            });
        };

        //function for loop
        let isValid = (pageToken) => {
            return pageToken !== null;
        };

        return this.gDriveClient.authenticate().then(() => {
            return PromiseHelper.createPromiseForMethod()(isValid, processPage);
        });
    }

    uploadRecentItemsSince(since:any, prefix:string, dryRun:boolean) {
        let knownPaths = {};

        if (dryRun)
            console.log("Running in dry-run mode");

        let spinner = new Spinner(util.format("Looking for new files since %s", since.toString()));
        spinner.setSpinnerString(18);
        spinner.start();

        let uploadedFiles = [], skippedFiles = [];
        let basePath = path.join(this.localBasePath, prefix);

        return this.getFilesSince(basePath, since).then((toUpload) => {

            spinner.stop();
            let msg:string = toUpload.map((e) => { return path.join(prefix, e.path)  }).join("\n");
            console.log(util.format("\n%d files to upload\n%s", toUpload.length, msg));

            //Process each file one-by-one
            spinner.start();
            let fileIndex:number = 0, fileCount:number = toUpload.length;
            return Promise.mapSeries(toUpload, (item) => {

                let file:string = path.join(prefix, item.path);
                let filePath:string = path.dirname(file);
                spinner.setSpinnerTitle(util.format("Uploading (%d/%d) - %s", ++fileIndex, fileCount, file));

                return this.getParentIdForPath(filePath, knownPaths).then((parentId) => {

                    //Determine if the file already exists
                    return this.gDriveClient.getVideoFiles(parentId).then((response) => {

                        let fileName:string = path.basename(file);
                        let existingFile:any = response.files.find((x) => { return x.name == fileName});

                        //If the file exists and has the same modifiedTime, don't upload
                        if (existingFile) {
                            let cloudModifiedTime = moment(existingFile.modifiedTime);
                            if (cloudModifiedTime.isSame(item.modifiedTime)) {
                                skippedFiles.push(file);
                                return Promise.resolve();
                            }
                        }

                        if (dryRun) {
                            uploadedFiles.push(file);
                            return Promise.resolve();
                        }
                        else {
                            return this.gDriveClient.createFile(parentId, path.join(this.localBasePath, file)).then((newFile) => {
                                uploadedFiles.push(file);
                                return Promise.resolve();
                            });
                        }
                    });
                });
            });
        }).then(() => {
            spinner.stop(true);
            console.log(util.format("Uploaded %d videos\n%s", uploadedFiles.length, uploadedFiles.join("\n")));
            if (skippedFiles.length > 0)
                console.log(util.format("Skipped %d videos\n%s", skippedFiles.length, skippedFiles.join("\n")));
        });
    }

    getFilesSince(basePath:string, since:any) {
        let toUpload = [];
        return Promise.promisify(readDir.read)(basePath, this.videoFilterArray).then((files) => {

            files.forEach((file) => {

                let stat:any = fs.statSync(path.join(basePath, file));
                let dtLocal:any = moment(stat.ctime);
                if (dtLocal.isSameOrAfter(since)) {
                    toUpload.push({
                        path: file,
                        createdTime: dtLocal,
                        modifiedTime: moment(stat.mtime)
                    });
                }
            });
        }).then(() => {
            return Promise.resolve(toUpload);
        });
    }

    /***
     * Returns a single ParentId based on the path passed in.
     * -- Lots of assumptions here... mainly that Google drive root location represents the same
     *    hierarchy as the localBasePath used in ctor
     * @param path
     * @param knownPaths
     * @returns {any}
     */
    getParentIdForPath(path:string, knownPaths:any) {

        if (knownPaths.hasOwnProperty(path))
            return Promise.resolve(knownPaths[path]);

        //Eval the path hierarchy starting from the beginning of the path, walking the folder structure.
        let parts = path.split('/');
        let parentId;
        return Promise.mapSeries(parts, (part) => {

            //Walk the path hierarchy passing in the parentId as a starting off point and the path's
            //part name, to limit the returned list to only items that could exist in the same hierarchy
            //as the local file system.
            return this.gDriveClient.getFolders(parentId, part).then((items) => {
               let folder = items.find((file) => { return file.name == part });
               if (folder == null) {
                   return this.gDriveClient.createFolder(part, parentId).then((newFolder) => {
                       parentId = newFolder.id;
                       console.log(util.format("\nCreated Folder: '%s' for path: '%s'", part, path));
                   });
               } else {
                   parentId = folder.id;
               }
            });
        }).then(() => {
            //update knownPaths cache
            knownPaths[path] = parentId;
            return Promise.resolve(parentId);
        });
    }
}
