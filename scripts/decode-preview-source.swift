// macOS helper for the offline preview renderer. Keep the original WebP
// unchanged; export its pixels as sRGB data for the Node math renderer.
import AppKit
let image = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))!
var bytes = [UInt8](repeating: 255, count: image.pixelsWide * image.pixelsHigh * 4)
for y in 0..<image.pixelsHigh {
  for x in 0..<image.pixelsWide {
    let color = image.colorAt(x: x, y: y)!.usingColorSpace(.sRGB)!
    let i = (y * image.pixelsWide + x) * 4
    bytes[i] = UInt8((color.redComponent * 255).rounded())
    bytes[i+1] = UInt8((color.greenComponent * 255).rounded())
    bytes[i+2] = UInt8((color.blueComponent * 255).rounded())
  }
}
try Data(bytes).write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
