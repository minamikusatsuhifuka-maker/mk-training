// コーポレートブックのページ画像を生成する（131-補2・macOS専用・依存追加なし）
// 実行: osascript -l JavaScript scripts/generate-corporate-book-pages.js
// 改訂手順: ① private/corporate-design-book.pdf を差し替え → ② 本スクリプトを実行
//           → ③ private/corporate-book-pages/ の生成物をコミット（3ステップ・版管理）
// 出力: 長辺2000px（実ピクセル・Retina2倍描画）・JPEG品質0.8 ≒ 1ページ数十〜数百KB

ObjC.import("Quartz");
ObjC.import("AppKit");
ObjC.import("Foundation");

const ROOT = "/Users/tpjatpja/projects/mk-training";
const PDF = `${ROOT}/private/corporate-design-book.pdf`;
const OUT_DIR = `${ROOT}/private/corporate-book-pages`;
const LONG_EDGE_PT = 1000; // ポイント指定（Retina 2x で実2000pxになる）
const QUALITY = 0.8;

const fm = $.NSFileManager.defaultManager;
fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
  OUT_DIR, true, $(), $()
);

const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(PDF));
const n = doc.pageCount;
for (let i = 0; i < n; i++) {
  const page = doc.pageAtIndex(i);
  const bounds = page.boundsForBox($.kPDFDisplayBoxMediaBox);
  const scale = LONG_EDGE_PT / Math.max(bounds.size.width, bounds.size.height);
  const w = Math.round(bounds.size.width * scale);
  const h = Math.round(bounds.size.height * scale);
  const img = $.NSImage.alloc.initWithSize($.NSMakeSize(w, h));
  img.lockFocus;
  $.NSGraphicsContext.currentContext.imageInterpolation =
    $.NSImageInterpolationHigh;
  const t = $.NSAffineTransform.transform;
  t.scaleBy(scale);
  t.concat;
  page.drawWithBox($.kPDFDisplayBoxMediaBox);
  img.unlockFocus;
  const rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
  const props = $.NSMutableDictionary.dictionary;
  props.setObjectForKey(
    $.NSNumber.numberWithDouble(QUALITY),
    "NSImageCompressionFactor"
  );
  // 3 = NSBitmapImageFileTypeJPEG（JXAでは列挙定数が解決されないため数値指定）
  const jpg = rep.representationUsingTypeProperties(3, props);
  const name = `page-${String(i + 1).padStart(3, "0")}.jpg`;
  jpg.writeToFileAtomically(`${OUT_DIR}/${name}`, true);
}
`${n}ページを生成しました → ${OUT_DIR}`;
