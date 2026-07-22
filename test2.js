const text = '[download] [f137]  15.0% of 10MiB';
const isDlProgress = /^\s*\[download\]\s+(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:KiB|MiB|GiB|TiB|B))/i.test(text);
console.log('isDlProgress:', isDlProgress);