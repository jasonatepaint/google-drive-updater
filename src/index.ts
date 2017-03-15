import { MediaServices } from './mediaServices';
import * as moment from 'moment';
import * as command from 'commander';

main();
function main() {

    let program = command;
    program
        .version('0.0.1')
        .option('-f, --function [func]', 'The function to run', 'uploadRecent')
        .option('-p, --path [path]', 'The base path to the local video files', '')
        .option('-P, --prefix [prefix]', 'A path prefix in relation to directories underneath the local base path.', '')
        .option('-s, --since [since]', 'A prefix to limit what directories are scanned', '')
        .option('-d, --days-ago [daysAgo]', 'Number of days back to consider when updating. ignored if --since is used', '1')
        .option('-r, --dry-run [dryRun]', 'Determines whether files are copied or not', false)
        .parse(process.argv);


    switch (program.function) {
        case "uploadRecent":
            uploadRecent(program);
    }
    //
    // return svc.updateModifiedDateOnGoogleDriveFiles().then(() => {
    //    console.log("done");
    // });
}

function uploadRecent(program) {
    let localBasePath = program.path;
    let prefix = program.prefix || "";
    let dryRun:boolean = program.dryRun ? true : false;

    if (localBasePath == null  || localBasePath.length == 0)
    {
        console.error("local path not defined. Use --path");
        process.exit();
    }

    let since;
    if (program.since && program.since.length > 0) {
        since = moment(program.since);
    } else {
        since = moment().subtract(program.daysAgo, 'd');
    }

    let svc = new MediaServices(localBasePath);
    return svc.uploadRecentItemsSince(since, prefix, dryRun).then(() => {
        console.log("done");
        process.exit();
    });
}