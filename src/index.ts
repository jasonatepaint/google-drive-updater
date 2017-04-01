import { MediaServices } from './mediaServices';
import * as moment from 'moment';
import * as command from 'commander';
import * as log4js from 'log4js';

log4js.configure('logging_config.json', { cwd: './logs' });
let logger = log4js.getLogger();

main();
function main() {

    let program = command;
    program
        .version('1.0.0')
        .option('-f, --function [func]', 'The function to run', 'uploadRecent')
        .option('-p, --path [path]', 'The base path to the local video files', '')
        .option('-P, --prefix [prefix]', 'A path prefix in relation to directories underneath the local base path.', '')
        .option('-s, --since [since]', 'Find files based on files created since an iso8601 date.', '')
        .option('-a, --days-ago [daysAgo]', 'Find files based on number of days back to consider. ignored if --since is used.', '1')
        .option('-l, --use-last-run [useLastRun]', 'If available, uses the last-run file to determine the \'since\' date. If declared \'days-ago\' and \'since\' are ignored', false)
        .option('-d, --dry-run [dryRun]', 'Determines whether files are copied or not', false)
        .parse(process.argv);


    switch (program.function) {
        case "uploadRecent":
            uploadRecent(program);
    }
}

function uploadRecent(program) {
    let localBasePath = program.path;
    let prefix = program.prefix || "";
    let dryRun:boolean = program.dryRun;
    let svc = new MediaServices(localBasePath);

    if (localBasePath == null  || localBasePath.length == 0)
    {
        logger.error("local path not defined. Use --path");
        process.exit();
    }

    let since;
    if (program.useLastRun) {
        since = svc.getLastRunTime(prefix);
    }

    //if useLastRun is used and is null, default to since/daysAgo
    if (since == null) {
        if (program.since && program.since.length > 0) {
            since = moment(program.since);
        } else {
            since = moment().subtract(program.daysAgo, 'd');
        }
    }

    return svc.uploadRecentItemsSince(since, prefix, dryRun).then(() => {
        logger.info("done");
        log4js.shutdown(() => {
            process.exit();
        });
    });
}