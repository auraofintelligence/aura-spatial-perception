import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the local spatial instrument entry point", async () => {
  const [html, component, viewport, styles, packageJson] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SpatialInstrument.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AuraViewport.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<title>Aura Spatial Perception · Local Instrument<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, /assets\/index-[^"']+\.js/);
  assert.match(component, /LOCAL PROCESSING/);
  assert.match(component, /no media upload · no ChatGPT hosting/);
  assert.match(component, /Learn by touching the instrument/);
  assert.match(component, /No source image or inference has been invented/);
  assert.match(component, /One 12 × 24 torus samples the view/);
  assert.match(component, /Use one torus/);
  assert.match(component, /Compare all/);
  assert.match(component, /torus outer envelope/);
  assert.match(component, /max=\{focusedReachControlMax\}/);
  assert.match(component, /shellScales=\{shellScales\}/);
  assert.match(component, /selectedMatrixId=\{selectedMatrix\.id\}/);
  assert.match(component, /One angular guide at a time/);
  assert.match(component, /Outside horn/);
  assert.match(component, /Inside photo \+ rays/);
  assert.match(component, /Open direction · no depth point/);
  assert.match(component, /inside-ray-profile/);
  assert.match(component, /horn address/);
  assert.match(component, /open search · no hit/);
  assert.match(component, /not a confirmed surface hit/);
  assert.match(component, /viewMode === "zero" && layers\.rays/);
  assert.match(component, /continues through the horn to the display limit/);
  assert.match(component, /Flattened 12 × 24 address map/);
  assert.match(component, /How was this range established\?/);
  assert.match(component, /Place estimate on selected ray/);
  assert.match(component, /knownSizeRangeEvidence/);
  assert.match(component, /useState<ManualRangeBasis>\("estimated"\)/);
  assert.doesNotMatch(component, /useState\("2\.4"\)/);
  assert.match(component, /four explicitly derived hypotheses/);
  assert.match(component, /mobile-quick-controls/);
  assert.match(component, /Automatic rotation speed/);
  assert.match(component, /auto-rotate/);
  assert.match(component, /Range first, then surfaces, objects and mesh/);
  assert.match(component, /observation\.scenePipeline\.map/);
  assert.match(component, /object detection and provisional mesh generation remain empty/i);
  assert.match(component, /Export range points · PLY/);
  assert.match(component, /positive metre constraints only · no faces/);
  assert.match(component, /type="file" multiple accept="image\/jpeg,image\/png,image\/webp/);
  assert.match(component, /Separate MP4 fixture/);
  assert.match(component, /input type="file" accept="\.360"/);
  assert.match(component, /No native-to-working-view relationship is invented/);
  assert.match(component, /const sourceId = activePhotoSourceId/);
  assert.doesNotMatch(component, /accept="\.360,video\/\*"/);
  assert.doesNotMatch(component, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
  assert.match(viewport, /angularFacetParameterCorners\(facetNumber\)/);
  assert.match(viewport, /displaySearchRadius\(maximumShellReach, maximumRange\)/);
  assert.match(viewport, /new THREE\.RingGeometry/);
  assert.match(viewport, /viewMode === "orbit" && layers\.points && selectedMeasuredRange > 0/);
  assert.match(viewport, /EQUIRECTANGULAR_PHOTOSPHERE_YAW_RADIANS/);
  assert.match(viewport, /viewMode === "zero" \? THREE\.BackSide/);
  assert.doesNotMatch(viewport, /\.scale\(-1, 1, 1\)/);
  assert.match(viewport, /camera\.position\.set\(0, 0, 0\)/);
  assert.doesNotMatch(viewport, /camera\.position\.set\(0, 0, 0\.02\)/);
  assert.match(viewport, /cameraMemoryRef = useRef\(createViewportCameraMemory\(\)\)/);
  assert.match(viewport, /cameraMemory\.inside\.yaw/);
  assert.match(viewport, /cameraMemory\.orbit\.theta/);
  assert.match(viewport, /cameraMemory\.orbit\.rootYaw = root\.rotation\.y/);
  assert.doesNotMatch(viewport, /let theta = 0\.65|let yaw = 0/);
  assert.match(styles, /\.switch input:focus-visible \+ span/);
  assert.match(styles, /@media \(max-width: 1500px\), \(max-height: 900px\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /flex: 0 0 24px/);
  assert.match(styles, /stage-toolbar button:focus-visible \{ outline-offset: -3px; \}/);
  assert.match(styles, /\.inside-ray-profile-track/);
  assert.match(styles, /\.inside-ray-profile figcaption/);
  assert.match(styles, /overflow-x: clip/);
  assert.match(packageJson, /"name": "aura-spatial-perception"/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare|hosting|react-loading-skeleton/i);
});

test("contains no ChatGPT hosting declaration or disposable starter preview", async () => {
  await assert.rejects(access(new URL("../.openai/hosting.json", import.meta.url)));
});
