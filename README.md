# google-drive-updater

## Setup
* Rename _config/config-example.json_ to _config/config.json_ and edit values
* Requires a [Google developer account](https://console.developers.google.com). 
    * Create an API account that has access to your google drive account
    * Download the JWT json file that contains your private key/account information.
    * Rename to _gdrive-key.json_.
* Run `npm install && typings install`    

## Functions

---

### Upload Recent
Compares a local directory to a Google Drive account and uploads all content based on the params passed in. 

### Params
-f, --function [func] -- The function to run, defaults to 'uploadRecent'

-p, --path [path] -- The base path to the local video files. No default value. Must be included

-P, --prefix [prefix] -- A path prefix in relation to directories underneath the local base path. No default Value. Not required.

-l, --use-last-run -- If available, uses the last-run file to determine the 'since' date. If --days-ago and --since are ignored. Defaults to false.

-s, --since [since] -- Find files based on files created since an iso8601 date. 

-a, --days-ago [daysAgo] -- Find files based on number of days back to consider. ignored if --since is used. Defaults to '1'

-d, --dry-run -- Determines whether files are copied or not. Defaults to false.

### Example

```$xslt
node index --function uploadRecent --path /Volumes/Video --prefix "Movies" --days-ago 1 --dry-run
```
