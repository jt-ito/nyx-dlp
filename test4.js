const text = '[download]  159.88KiB at    104.22B/s (00:00:02) (frag 34)';
const progressMatch = text.match(/^\s*\[(?:download|ExtractAudio)\]\s+(?:\[(.*?)\]\s+)?(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:KiB|MiB|GiB|TiB|B))/i);
console.log('Match:', !!progressMatch);