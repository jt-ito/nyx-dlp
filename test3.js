const lines = [
    '[download] Destination: video.mp4',
    '[download] [video] 15% of 100MiB',
    '[download] [audio]  5% of 10MiB',
    '[download] 20% of 110MiB'
];
const regex = /^\s*\[(?:download|ExtractAudio)\]\s+(?:\[(.*?)\]\s+)?(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:KiB|MiB|GiB|TiB|B))/i;

for (const text of lines) {
    const match = text.match(regex);
    console.log(text, '=>', match ? 'MATCH (' + (match[1] || 'default') + ')' : 'NO MATCH');
}