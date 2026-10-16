// Reads a PDF entirely on this Mac: renders each page with PDFKit and runs the
// system Vision text recogniser over it. No network, no third-party service.
// Prints JSON: one entry per recognised line, with position and confidence.

import Foundation
import PDFKit
import Vision
import CoreGraphics

struct Line: Codable {
    let page: Int
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data(("pdftext: " + message + "\n").utf8))
    exit(1)
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else { fail("usage: pdftext <file.pdf> [scale]") }
let path = arguments[1]
// Scanned statements are often low resolution; rendering above 1:1 gives the
// recogniser more to work with.
let scale = arguments.count >= 3 ? (Double(arguments[2]) ?? 3.0) : 3.0

guard let document = PDFDocument(url: URL(fileURLWithPath: path)) else {
    fail("could not open the PDF")
}

var lines: [Line] = []
var anyTextLayer = false

for pageIndex in 0..<document.pageCount {
    guard let page = document.page(at: pageIndex) else { continue }

    // If the page already carries real text, use it; it is exact.
    if let embedded = page.string, embedded.trimmingCharacters(in: .whitespacesAndNewlines).count > 40 {
        anyTextLayer = true
        for raw in embedded.components(separatedBy: .newlines) {
            let text = raw.trimmingCharacters(in: .whitespaces)
            if text.isEmpty { continue }
            lines.append(Line(page: pageIndex + 1, text: text, confidence: 1,
                              x: 0, y: 0, width: 0, height: 0))
        }
        continue
    }

    let bounds = page.bounds(for: .mediaBox)
    let pixelWidth = Int(bounds.width * scale)
    let pixelHeight = Int(bounds.height * scale)
    guard pixelWidth > 0, pixelHeight > 0,
          let context = CGContext(data: nil, width: pixelWidth, height: pixelHeight,
                                  bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { continue }

    context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
    context.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
    page.draw(with: .mediaBox, to: context)

    guard let image = context.makeImage() else { continue }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false   // never "correct" a digit
    request.revision = VNRecognizeTextRequestRevision3
    request.recognitionLanguages = ["en-US"]

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do { try handler.perform([request]) } catch { continue }

    for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        lines.append(Line(page: pageIndex + 1,
                          text: candidate.string,
                          confidence: candidate.confidence,
                          x: Double(box.minX),
                          // Vision measures from the bottom; flip so that
                          // smaller y means nearer the top of the page.
                          y: Double(1 - box.maxY),
                          width: Double(box.width),
                          height: Double(box.height)))
    }
}

let output: [String: Any] = [
    "pages": document.pageCount,
    "source": anyTextLayer ? "text-layer" : "ocr",
    "lines": lines.map { [
        "page": $0.page, "text": $0.text, "confidence": $0.confidence,
        "x": $0.x, "y": $0.y, "width": $0.width, "height": $0.height,
    ] },
]
let data = try JSONSerialization.data(withJSONObject: output, options: [])
FileHandle.standardOutput.write(data)
