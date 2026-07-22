const text = '[download]   15.00KiB at    1.42MiB/s (00:00:00)';
const isDlProgress = /^\s*\[download\]\s+(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:KiB|MiB|GiB|TiB|B))/i.test(text);
console.log('isDlProgress:', isDlProgress);