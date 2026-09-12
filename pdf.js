import { jsPDF } from 'jspdf'

/**
 * Builds a simple end-of-day summary PDF and triggers a browser download.
 * report: { restaurantName, from, to, itemTotals: [{name, qty, revenue}], orderCount, grossRevenue }
 */
export function saveEODPdf(report) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 48
  let y = 56

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Shift Report', left, y)
  y += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`Restaurant: ${report.restaurantName}`, left, y); y += 16
  doc.text(`Session window: ${report.from} — ${report.to}`, left, y); y += 16
  doc.text(`Orders served: ${report.orderCount}`, left, y); y += 16
  doc.setFont('helvetica', 'bold')
  doc.text(`Gross revenue: PKR ${report.grossRevenue.toFixed(2)}`, left, y); y += 28

  doc.setFont('helvetica', 'bold')
  doc.text('Item', left, y)
  doc.text('Qty', left + 300, y)
  doc.text('Revenue', left + 380, y)
  y += 8
  doc.line(left, y, 550, y)
  y += 16

  doc.setFont('helvetica', 'normal')
  report.itemTotals
    .sort((a, b) => b.revenue - a.revenue)
    .forEach(row => {
      if (y > 780) { doc.addPage(); y = 56 }
      doc.text(row.name, left, y)
      doc.text(String(row.qty), left + 300, y)
      doc.text(`PKR ${row.revenue.toFixed(2)}`, left + 380, y)
      y += 18
    })

  doc.save(`shift-report-${report.to}.pdf`)
}
