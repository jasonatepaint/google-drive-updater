import { PromiseHelper } from './promiseHelper';
import * as google from 'googleapis';
import * as Promise from 'bluebird';
import JWT = google.auth.JWT;
import * as fs from "fs";
import * as path from 'path';
import * as mime from 'mime-types';
import * as moment from 'moment';
import * as util from 'util';

const MIME_TYPE_FOLDER = "application/vnd.google-apps.folder";
const MIME_TYPE_VIDEO_PREFIX = "video/";
const FIELDS_FILE = "id,name,size,parents,createdTime,modifiedTime";
const FIELDS_FOLDER = "id,name,parents,createdTime,modifiedTime";

let key = require('./../config/gdrive-key.json');
let config = require('./../config/config.json');

const MY_DRIVE_ROOT_ID = config.gDriveRootId;

export class GoogleDriveClient {

    jwtClient: any;
    drive: any;
    pathCache: any;
    folderCache: any;

    constructor() {
        this.jwtClient = new JWT(
            key.client_email,
            null,
            key.private_key,
            ['https://www.googleapis.com/auth/drive'],
            config.gDriveSubject
        );
        this.drive = google.drive({ version: 'v3', auth: this.jwtClient });
        this.pathCache = {};
        this.folderCache = {};
    }

    authenticate()
    {
        let deferred = Promise.defer();
        this.jwtClient.authorize((err, tokens) => {
            if (err)
                console.log(err);
            deferred.resolve();
        });
        return deferred.promise;
    }

    getVideoFiles(parentId:string, pageToken:string) {
        let params = {
            pageSize: 100,
            pageToken: pageToken,
            spaces: 'drive',
            orderBy: "folder, name, createdTime",
            fields: "nextPageToken, files(" + FIELDS_FILE + ")",
            q: this.buildFilesQuery(parentId, MIME_TYPE_VIDEO_PREFIX)
        };

        if (!pageToken)
            delete params.pageToken;

        return Promise.promisify(this.drive.files.list)(params)
        .catch((e) => {
            console.error(util.format("getFolders:\n%s\n\n%s", JSON.stringify(params, e)));
        });
    };

    buildFilesQuery(parentId?:string, mimeType?:string) {
        let q = [];
        q.push("trashed = false");
        if (parentId !== undefined && parentId !== null)
            q.push("'" + parentId + "' in parents");
        if (mimeType !== undefined && mimeType !== null)
            q.push("mimeType contains '" + mimeType + "'");
        return q.join(" and ");
    }

    getFolderCacheKey(parentId:string, name?:string) {
        return name !== undefined ?
            util.format("%s_%s", parentId, name) :
            parentId;
    }

    getFolders(parentId?:string, name?:string) {
        if (parentId === undefined)
            parentId = 'root';

        let cacheKey:string = this.getFolderCacheKey(parentId, name);
        if (this.folderCache.hasOwnProperty(cacheKey))
            return Promise.resolve(this.folderCache[cacheKey]);

        let query:string =  util.format("trashed=false and mimeType = '%s' and '%s' in parents", MIME_TYPE_FOLDER, parentId);
        if (name) {
            query += util.format(" and name = '%s'", name.replace('\'', '\\\''));
        }

        let params = {
            pageSize: 1000,  //TODO: paginate this
            spaces: 'drive',
            orderBy: "folder, name, createdTime",
            fields: "nextPageToken, files(" + FIELDS_FOLDER + ")",
            q: query
        };
        return Promise.promisify(this.drive.files.list)(params).then((res) => {
            this.folderCache[cacheKey] = res.files;
            return res.files;
        })
        .catch((e) => {
            console.error(util.format("getFolders:\n%s\n\n%s", JSON.stringify(params, e)));
        });
    };

    createFolder(name:string, parentId:string) {
        let params = {
            resource: {
                name : name,
                mimeType : MIME_TYPE_FOLDER,
                parents: [ parentId ],
            },
            fields: FIELDS_FILE
        };
        return Promise.promisify(this.drive.files.create)(params).catch((e) => {
            console.error(util.format("createFolders:\n%s\n\n%s", JSON.stringify(params, e)));
        });
    }

    createFile(parentId:string, filePath:string) {
        let name:string = path.basename(filePath);
        let params = {
            resource: {
                name: name,
                modifiedTime: moment(fs.statSync(filePath).mtime).toISOString(),
                parents: [ parentId ]
            },
            media: {
                mimeType: mime.lookup(name),
                body: fs.createReadStream(filePath)
            },
            fields: FIELDS_FILE
        };
        return Promise.promisify(this.drive.files.create)(params);
    }

    /**
     * Returns the full Google drive folder path of a given file.
     *
     * This makes the assumption that the gdrive files have a flat (single parent) structure,
     * which matches the structure of the local filesystem that uploaded it.
     *
     * @param file
     */
    getFullPath(file:any) {
        let paths = [];
        let rootParentId;

        //Function that will be called for each file (folder) in the parental hierarchy
        let processFile = (file) =>{

            //no parent, we're done
            if (file.parents === undefined)
                return Promise.resolve();

            let parentId;
            if (Array.isArray(file.parents) && file.parents.length > 0)
                parentId = file.parents[0];

            //we don't have an array of objects or we've hit the root
            if (parentId === undefined || parentId == MY_DRIVE_ROOT_ID)
                return Promise.resolve();

            if (rootParentId === undefined)
                rootParentId = parentId;

            if (this.pathCache.hasOwnProperty(parentId)){
                paths.push(this.pathCache[parentId]);
                return Promise.resolve();
            }

            return this.getFile(parentId).then((driveFile) => {
                paths.unshift(driveFile.name);
                return driveFile;
            });
        };

        //function for loop
        let isValid = (file) => {
            return file !== undefined;
        };

        return PromiseHelper.createPromiseForMethod()(isValid, processFile).then(() => {
            let path = paths.join('/');

            //use the local cache if we have already seen a file's parent id
            if (!this.pathCache.hasOwnProperty(rootParentId))
                this.pathCache[rootParentId] = path;

            return path;
        });
    }

    getFile(fileId:string) {
        let options = {
            fileId: fileId,
            fields: FIELDS_FILE,

        };
        return Promise.promisify(this.drive.files.get)(options);
    }

    updateFile(fileId:string, file:any) {
        let params = {
            fileId: fileId,
            fields: FIELDS_FILE,
            resource: file
        };
        let options = {

        };
        return Promise.promisify(this.drive.files.update)(params, options);
    }
}
