// Dynamic banner: pick a random image on every page load / swup navigation.
// Primary source returns a 302 redirect to a random anime wallpaper;
// fallback to picsum.photos if it fails.
const RANDOM_BANNER_PRIMARY = "https://t.alcy.cc/ycy";
const RANDOM_BANNER_FALLBACK = "https://picsum.photos/1920/1080";

function applyRandomBanner(img: HTMLImageElement) {
	const seed = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	const primary = `${RANDOM_BANNER_PRIMARY}?${seed}`;
	if (img.dataset.randomBanner === "fallback") {
		img.src = `${RANDOM_BANNER_FALLBACK}?${seed}`;
		return;
	}
	img.onerror = () => {
		img.onerror = null;
		img.dataset.randomBanner = "fallback";
		img.src = `${RANDOM_BANNER_FALLBACK}?${seed}`;
	};
	img.src = primary;
}

export function initRandomBanner() {
	const banner = document.getElementById("banner");
	if (!banner) return;
	const img = banner.querySelector("img") as HTMLImageElement | null;
	if (!img) return;
	if (!img.dataset.randomBanner) {
		// first run: mark and apply; swup replaces the DOM so re-run fires per visit
		img.dataset.randomBanner = "primary";
	}
	applyRandomBanner(img);
}
