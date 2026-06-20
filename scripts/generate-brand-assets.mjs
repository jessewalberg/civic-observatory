import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PUBLIC_DIR = new URL("../public/", import.meta.url);
const publicPath = (fileName) => fileURLToPath(new URL(fileName, PUBLIC_DIR));

const colors = {
	background: "#0A0A0B",
	surface: "#141417",
	primary: "#FF6B4A",
	teal: "#2DD4BF",
	text: "#F8FAFC",
	muted: "#A1A1AA",
};

function iconSvg(size) {
	return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="${colors.background}"/>
  <circle cx="256" cy="256" r="164" fill="none" stroke="${colors.primary}" stroke-width="28"/>
  <circle cx="256" cy="256" r="92" fill="none" stroke="${colors.teal}" stroke-width="20" opacity="0.9"/>
  <path d="M256 76v62M256 374v62M76 256h62M374 256h62" stroke="${colors.primary}" stroke-width="22" stroke-linecap="round"/>
  <text x="256" y="286" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="104" font-weight="800" fill="${colors.text}" letter-spacing="0">CO</text>
</svg>`;
}

function socialSvg() {
	return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${colors.background}"/>
  <rect x="64" y="64" width="1072" height="502" rx="32" fill="${colors.surface}" stroke="#27272A" stroke-width="2"/>
  <circle cx="150" cy="150" r="38" fill="${colors.primary}"/>
  <circle cx="150" cy="150" r="21" fill="${colors.background}"/>
  <path d="M150 102v22M150 176v22M102 150h22M176 150h22" stroke="${colors.teal}" stroke-width="8" stroke-linecap="round"/>
  <text x="224" y="157" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="800" fill="${colors.text}" letter-spacing="0">Civic Observatory</text>
  <text x="86" y="272" font-family="Inter, Arial, sans-serif" font-size="66" font-weight="800" fill="${colors.text}" letter-spacing="0">Local government</text>
  <text x="86" y="344" font-family="Inter, Arial, sans-serif" font-size="66" font-weight="800" fill="${colors.text}" letter-spacing="0">meeting alerts</text>
  <text x="90" y="408" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="500" fill="${colors.muted}" letter-spacing="0">AI-powered summaries for city councils,</text>
  <text x="90" y="452" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="500" fill="${colors.muted}" letter-spacing="0">school boards, and planning commissions.</text>
  <g font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700">
    <rect x="90" y="492" width="204" height="58" rx="18" fill="#FF6B4A22" stroke="${colors.primary}"/>
    <text x="122" y="530" fill="${colors.primary}" letter-spacing="0">Summaries</text>
    <rect x="326" y="492" width="158" height="58" rx="18" fill="#2DD4BF1F" stroke="${colors.teal}"/>
    <text x="358" y="530" fill="${colors.teal}" letter-spacing="0">Alerts</text>
    <rect x="516" y="492" width="234" height="58" rx="18" fill="#FFFFFF10" stroke="#3F3F46"/>
    <text x="548" y="530" fill="${colors.text}" letter-spacing="0">Civic records</text>
  </g>
  <g transform="translate(836 184)" opacity="0.95">
    <circle cx="120" cy="120" r="118" fill="none" stroke="${colors.primary}" stroke-width="18"/>
    <circle cx="120" cy="120" r="70" fill="none" stroke="${colors.teal}" stroke-width="14"/>
    <circle cx="120" cy="120" r="18" fill="${colors.text}"/>
    <path d="M120 0v40M120 200v40M0 120h40M200 120h40" stroke="${colors.primary}" stroke-width="14" stroke-linecap="round"/>
  </g>
</svg>`;
}

async function renderPng(svg, size, fileName) {
	await sharp(Buffer.from(svg))
		.resize(size, size)
		.png()
		.toFile(publicPath(fileName));
}

async function renderSocialImage() {
	await sharp(Buffer.from(socialSvg()))
		.png()
		.toFile(publicPath("social-preview.png"));
}

function createIco(images) {
	const headerSize = 6;
	const directorySize = 16 * images.length;
	let offset = headerSize + directorySize;
	const header = Buffer.alloc(headerSize);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);

	const directories = images.map(({ size, buffer }) => {
		const directory = Buffer.alloc(16);
		directory.writeUInt8(size >= 256 ? 0 : size, 0);
		directory.writeUInt8(size >= 256 ? 0 : size, 1);
		directory.writeUInt8(0, 2);
		directory.writeUInt8(0, 3);
		directory.writeUInt16LE(1, 4);
		directory.writeUInt16LE(32, 6);
		directory.writeUInt32LE(buffer.length, 8);
		directory.writeUInt32LE(offset, 12);
		offset += buffer.length;
		return directory;
	});

	return Buffer.concat([header, ...directories, ...images.map((i) => i.buffer)]);
}

async function renderFaviconIco() {
	const images = await Promise.all(
		[16, 32].map(async (size) => ({
			size,
			buffer: await sharp(Buffer.from(iconSvg(size)))
				.resize(size, size)
				.png()
				.toBuffer(),
		})),
	);
	await writeFile(publicPath("favicon.ico"), createIco(images));
}

await renderPng(iconSvg(16), 16, "favicon-16x16.png");
await renderPng(iconSvg(32), 32, "favicon-32x32.png");
await renderPng(iconSvg(180), 180, "apple-touch-icon.png");
await renderPng(iconSvg(192), 192, "icon-192.png");
await renderPng(iconSvg(512), 512, "icon-512.png");
await renderFaviconIco();
await renderSocialImage();
