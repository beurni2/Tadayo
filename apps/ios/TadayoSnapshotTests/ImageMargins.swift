import Foundation

#if canImport(UIKit)
    import UIKit
#endif

/// How much of its canvas a Lab image keeps above and below what it draws.
///
/// Each section is drawn on the canvas with 24 points of padding above and below it, in a window
/// as tall as the content the host measured for it. Where a line breaks differently in the
/// drawing than in the measure, the two disagree: a window shorter than its content crops the
/// padding at both ends, and a taller one shows a strip of its own colour above and below. Both
/// came out of the first runs of `Lab-people-more` (29 and 52 points out), when it was drawn at
/// 2x and measured at the simulator's 3x, and a snapshot compared with its own reference can't
/// see either: the reference is the same wrong image. This can.
struct ImageMargins: Equatable {
    /// Points from the top edge, and from the bottom edge, to the first row that isn't canvas.
    let top: Double
    let bottom: Double

    /// A strip thinner than this at an edge is rounding, not a window out of step: the pixel row
    /// `Lab-photos` ends with, measured at 3x and drawn at 1x.
    static let forgiven = 1.0

    /// Of the 24 points of padding, less what the first line's own leading and rounding take;
    /// the images that fit their windows keep at least 22.5.
    static let least = 20.0

    /// The margins of an image `width` by `height` pixels at `scale` pixels to the point, whose
    /// canvas is the colour most of its left edge has (every section leaves it clear), or nil if
    /// that colour isn't most of the edge or the image is nothing else.
    ///
    /// - Parameter pixel: the red, green and blue of the pixel at a column and a row, 0 to 255.
    static func measure(
        width: Int, height: Int, scale: Double,
        pixel: (_ column: Int, _ row: Int) -> (red: UInt8, green: UInt8, blue: UInt8)
    ) -> ImageMargins? {
        guard width > 0, height > 0, scale > 0 else { return nil }
        var counts: [UInt32: Int] = [:]
        for row in 0..<height {
            let colour = pixel(0, row)
            counts[
                UInt32(colour.red) << 16 | UInt32(colour.green) << 8 | UInt32(colour.blue),
                default: 0] += 1
        }
        guard let (key, count) = counts.max(by: { $0.value < $1.value }), count * 2 > height
        else { return nil }
        let canvas = (red: Int(key >> 16), green: Int(key >> 8 & 255), blue: Int(key & 255))

        func isCanvas(_ column: Int, _ row: Int) -> Bool {
            let colour = pixel(column, row)
            return abs(Int(colour.red) - canvas.red) <= 2
                && abs(Int(colour.green) - canvas.green) <= 2
                && abs(Int(colour.blue) - canvas.blue) <= 2
        }
        func isBlank(_ row: Int) -> Bool { (0..<width).allSatisfy { isCanvas($0, row) } }

        let skipped = Int((forgiven * scale).rounded(.up))
        var first = skipped
        while first < height - skipped, isBlank(first) { first += 1 }
        guard first < height - skipped else { return nil }
        var last = height - 1 - skipped
        while last > first, isBlank(last) { last -= 1 }
        return ImageMargins(
            top: Double(first) / scale, bottom: Double(height - 1 - last) / scale)
    }
}

#if canImport(UIKit)
    extension ImageMargins {
        /// The margins of a snapshot image, read from its pixels.
        init?(_ image: UIImage) {
            guard let cgImage = image.cgImage else { return nil }
            let width = cgImage.width
            let height = cgImage.height
            var bytes = [UInt8](repeating: 0, count: width * height * 4)
            let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
                guard
                    let context = CGContext(
                        data: buffer.baseAddress, width: width, height: height,
                        bitsPerComponent: 8, bytesPerRow: width * 4,
                        space: CGColorSpace(name: CGColorSpace.sRGB)
                            ?? CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
                else { return false }
                context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
                return true
            }
            guard drawn,
                let margins = ImageMargins.measure(
                    width: width, height: height, scale: Double(image.scale),
                    pixel: { column, row in
                        let offset = (row * width + column) * 4
                        return (bytes[offset], bytes[offset + 1], bytes[offset + 2])
                    })
            else { return nil }
            self = margins
        }
    }
#endif
