import * as IM from "expo-image-manipulator";

async function resizeToJpeg(uri, width, compress) {
  if (IM.ImageManipulator?.manipulate) {
    const context = IM.ImageManipulator.manipulate(uri);
    context.resize({ width, height: null });
    const rendered = await context.renderAsync();
    return rendered.saveAsync({ compress, format: IM.SaveFormat.JPEG });
  }
  return IM.manipulateAsync(uri, [{ resize: { width } }], { compress, format: IM.SaveFormat.JPEG });
}

/** Proof of delivery: a JPEG of at most 1280 px (a few hundred KB on mobile data). */
export function prepareProofPhoto(asset) {
  return resizeToJpeg(asset.uri, Math.min(1280, asset.width || 1280), 0.75);
}

export async function fileBytes(uri) {
  return (await fetch(uri)).arrayBuffer();
}
