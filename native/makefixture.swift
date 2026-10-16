// Builds a fake scanned statement: draws a statement page into a bitmap and
// embeds only that image in a PDF, so there is no text layer and the reader is
// forced through recognition, exactly like a screenshotted statement.
// Every figure here is invented.

import Foundation
import CoreGraphics
import CoreText
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "fixture.pdf"

struct Row { let date: String; let description: String; let amount: String }

let withdrawals = [
    Row(date: "10/12/26", description: "CHECKCARD 1234 CORNER BAKERY NEW YORK NY", amount: "-12.50"),
    Row(date: "10/13/26", description: "CHECKCARD 1234 TN SERV FEE STATE UNIV IN", amount: "-25.00"),
    Row(date: "10/14/26", description: "MOBILE PURCHASE 5678 GROCERY OUTLET NJ", amount: "-8.75"),
    Row(date: "10/15/26", description: "PURCHASE 9012 COFFEE BAR NEW YORK NY", amount: "-4.25"),
]
let deposits = [
    Row(date: "10/16/26", description: "Zelle payment from JOHN SMITH Conf abc123", amount: "100.00"),
    Row(date: "10/17/26", description: "DIRECT DEP PAYROLL SOME EMPLOYER", amount: "1250.00"),
]

let pageWidth: CGFloat = 612, pageHeight: CGFloat = 792
let scale: CGFloat = 2.0   // render at 144 dpi, as a decent screenshot would be

func drawPage(_ heading: String, _ rows: [Row], total: String?) -> CGImage {
    let w = Int(pageWidth * scale), h = Int(pageHeight * scale)
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.scaleBy(x: scale, y: scale)

    let graphics = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics

    func text(_ string: String, _ x: CGFloat, _ yFromTop: CGFloat, size: CGFloat = 9, bold: Bool = false) {
        let font = bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.black]
        NSAttributedString(string: string, attributes: attributes)
            .draw(at: NSPoint(x: x, y: pageHeight - yFromTop))
    }

    text(heading, 24, 60, size: 13, bold: true)
    text("Date", 24, 84, bold: true)
    text("Description", 80, 84, bold: true)
    text("Amount", 520, 84, bold: true)

    var y: CGFloat = 104
    for row in rows {
        text(row.date, 24, y)
        text(row.description, 80, y)
        // Right-align the amount, as a statement does.
        let width = (row.amount as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 9)]).width
        text(row.amount, 575 - width, y)
        y += 20
    }
    if let total {
        text("Total \(heading.lowercased())", 24, y + 16, bold: true)
        let width = (total as NSString).size(withAttributes: [.font: NSFont.boldSystemFont(ofSize: 9)]).width
        text(total, 575 - width, y + 16, bold: true)
    }
    text("Page of", 520, 760)

    NSGraphicsContext.restoreGraphicsState()
    return ctx.makeImage()!
}

var box = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
guard let consumer = CGDataConsumer(url: URL(fileURLWithPath: out) as CFURL),
      let pdf = CGContext(consumer: consumer, mediaBox: &box, nil) else {
    FileHandle.standardError.write(Data("could not create the PDF\n".utf8)); exit(1)
}

for (heading, rows, total) in [
    ("Withdrawals and other subtractions", withdrawals, "-50.50"),
    ("Deposits and other additions", deposits, "1350.00"),
] {
    pdf.beginPDFPage(nil)
    pdf.draw(drawPage(heading, rows, total: total), in: box)
    pdf.endPDFPage()
}
pdf.closePDF()
print("wrote \(out)")
