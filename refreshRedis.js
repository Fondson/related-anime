var bluebird = require("bluebird");
var redis = require("redis");
var redisHelper = require('./redisHelper');
var crawl = require('./crawl');
var transformAnimes = require('./transformAnimes');

bluebird.promisifyAll(redis.RedisClient.prototype);
let dryrun = false;
let args = process.argv.slice(2);
const client = redisHelper.getClient();
if (client) {
    console.log('Got redis client!');
}

/*
THIS SCRIPT IS MEANT TO BE RUN MANUALLY!
THIS SCRIPT SHOULD IDEALLY BE RUN ON ANOTHER SERVER SO PRODUCTION DOES NOT
GET RATE LIMITED WHEN THIS SCRIPT IS RUNNING!

2 modes:
1. recrawl all parent keys, just call script
2. recrawl a specific key, call script with key to recrawl
ex; node refreshRedis.js anime:30831

Steps for running this script:
1. In redisHelper.js, set the url to the production url
2. Do a dryrun run to see what keys you will be refreshing and spot check some of
   them to make sure they are parents keys (connect to redis production using 
   `redis-cli -u <url>` and run `GET <key>`)
3. Run script with dryrun=false
----------------------------------------------------------------------------------
Future:

1. This can be run periodically using js setInterval() as well. The concern is that
production will be slow if we do this. Maybe find a time with few usages to run this
if we want to change this to run this in production.

2. Maybe can have this run periodically locally?
*/


// recrawls parent keys to keep cache updated
async function refreshRedis() {
    const parentKeys = await getAllParentKeys();
    for (let i = 0; i < parentKeys.length; ++i) {
        await refreshASeries(parentKeys[i]);
    }
}

async function getAllParentKeys() {
    let cursor = 0;
    let parentKeys = []
    while (true) {
        const result = await client.scanAsync(cursor);
        cursor = result[0];
        const keys = result[1];
        for (let i = 0; i < keys.length; ++i) {
            const key = keys[i];
            const value = await client.getAsync(key);
            if (!redisHelper.isKey(value)) {
                parentKeys.push(key);
            }
        }

        if (cursor == 0) {
            break;
        }
    }
    return parentKeys;
}

// Recrawls a specific key and update all child keys to point to 
// key. parentKey does not have to be the current parent key, but it will
// become the new parent key
async function refreshASeries(parentKey) {
    console.log('Refreshing ' + parentKey);
    const typeAndIdObj = redisHelper.getMalTypeAndMalIdFromKey(parentKey);
    let preTransform = await crawl(typeAndIdObj.malType, typeAndIdObj.malId, null, null);

    let postTransform = transformAnimes(preTransform);
    if (!dryrun) {
        // set to parent key to crawled result
        await redisHelper.setSeries(typeAndIdObj.malType, typeAndIdObj.malId, postTransform);
    } else {
        console.log('Would have set ' + parentKey + ' to:');
        console.log(postTransform);
        console.log('All children of ' + parentKey + ' would have been set!');
    }
}

async function main() {
    if (args.length == 1) {
        await refreshASeries(args[0]);
    } else {
        await refreshRedis();
    }
    console.log('Done!');
    process.exit()
}

main();
