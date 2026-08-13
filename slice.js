const fs = require('fs');
const lines = fs.readFileSync('test.m3u8', 'utf8').split('\n');
let out = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:10'];
let found = false;
for(let line of lines) {
    if(line.includes('init-2.mp4')) {
        out.push('#EXT-X-MAP:URI="https://d3vd9lfkzbru3h.cloudfront.net/904a490d9f803c5e78ed_onigiri_316300034674_1786415936/chunked/init-2.mp4"');
    }
    if(line.includes('2990')) found = true;
    if(found && line.match(/^[0-9]+(-muted)?\.mp4\r?$/)) {
        out.push('https://d3vd9lfkzbru3h.cloudfront.net/904a490d9f803c5e78ed_onigiri_316300034674_1786415936/chunked/' + line.trim());
    } else if (found && line.startsWith('#')) {
        out.push(line.trim());
    }
}
fs.writeFileSync('slice.m3u8', out.join('\n'));
console.log('Wrote new slice.m3u8 starting at chunk 2990 (08:17:30 VOD time)');
