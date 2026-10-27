// Dynamic banner for swup navigations.
// The first paint is handled by an inline script in the banner markup, which
// sets the source during parsing so the configured static image never flashes.
// This module only re-applies the cached session URL after a swup page swap.
const SESSION_KEY = "random-banner-url";
const RANDOM_BANNER_PRIMARY = "https://t.alcy.cc/ycy";
const RANDOM_BANNER_FALLBACK = "https://picsum.photos/1920/1080";

function pickRandomUrl(): string {
	const seed = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	return `${RANDOM_BANNER_PRIMARY}?${seed}`;
}

function resolveUrl(): string {
	try {
		const stored = sessionStorage.getItem(SESSION_KEY);
		if (stored) return stored;
		const fresh = pickRandomUrl();
		sessionStorage.setItem(SESSION_KEY, fresh);
		return fresh;
	} catch {
		return pickRandomUrl();
	}
}

function apply(img: HTMLImageElement, url: string) {
	const seed = url.split("?")[1] ?? String(Date.now());
	const current = img.getAttribute("src");
	// Already showing this exact URL: touching src would restart the load.
	if (current === url) return;

	img.onerror = () => {
		img.onerror = null;
		img.src = `${RANDOM_BANNER_FALLBACK}?${seed}`;
	};
	img.src = url;
}

export function initRandomBanner() {
	const img = document.querySelector(
		"#banner img[data-random-banner]",
	) as HTMLImageElement | null;
	if (!img) return;
	apply(img, resolveUrl());
}
