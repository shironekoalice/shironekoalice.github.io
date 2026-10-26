// Dynamic banner: pick one random image per visitor session (sessionStorage),
// so it stays stable while navigating within the site. A new visit/tab gets a new image.
// Primary source returns a 302 redirect to a random anime wallpaper;
// fallback to picsum.photos if it fails.
const RANDOM_BANNER_PRIMARY = "https://t.alcy.cc/ycy";
const RANDOM_BANNER_FALLBACK = "https://picsum.photos/1920/1080";
const SESSION_KEY = "random-banner-url";

function pickRandomUrl(): string {
	const seed = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	return `${RANDOM_BANNER_PRIMARY}?${seed}`;
}

function applyBannerUrl(img: HTMLImageElement, url: string) {
	if (img.dataset.randomBanner === "fallback") {
		// already fell back this session; keep picsum but with the same stability rule
		const seed = url.split("?")[1] ?? String(Date.now());
		const fallback = `${RANDOM_BANNER_FALLBACK}?${seed}`;
		if (img.src !== fallback) img.src = fallback;
		return;
	}
	img.onerror = () => {
		img.onerror = null;
		img.dataset.randomBanner = "fallback";
		img.src = `${RANDOM_BANNER_FALLBACK}?${url.split("?")[1] ?? String(Date.now())}`;
	};
	if (img.src !== url) img.src = url;
}

export function initRandomBanner() {
	const banner = document.getElementById("banner");
	if (!banner) return;
	const img = banner.querySelector("img") as HTMLImageElement | null;
	if (!img) return;

	try {
		let bannerUrl = sessionStorage.getItem(SESSION_KEY);
		if (!bannerUrl) {
			bannerUrl = pickRandomUrl();
			sessionStorage.setItem(SESSION_KEY, bannerUrl);
		}
		applyBannerUrl(img, bannerUrl);
	} catch {
		// sessionStorage unavailable (privacy mode etc.): just pick once per page load
		applyBannerUrl(img, pickRandomUrl());
	}
}
