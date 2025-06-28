const { createObjectCsvStringifier } = require("csv-writer");
const ExcelJS = require("exceljs");

// Export data to CSV
exports.exportToCSV = async (data, headers) => {
  if (!data || data.length === 0) {
    return "";
  }

  // Auto-detect headers if not provided
  if (!headers) {
    headers = Object.keys(data[0]).map((key) => ({
      id: key,
      title:
        key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1"),
    }));
  }

  const csvStringifier = createObjectCsvStringifier({
    header: headers,
  });

  const csvString =
    csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);
  return csvString;
};

// Export data to Excel
exports.exportToExcel = async (data, sheetName = "Data") => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  if (!data || data.length === 0) {
    return await workbook.xlsx.writeBuffer();
  }

  // Add headers
  const headers = Object.keys(data[0]);
  worksheet.columns = headers.map((header) => ({
    header:
      header.charAt(0).toUpperCase() +
      header.slice(1).replace(/([A-Z])/g, " $1"),
    key: header,
    width: 15,
  }));

  // Add data
  data.forEach((row) => {
    worksheet.addRow(row);
  });

  // Style the header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  // Add borders
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = maxLength < 10 ? 10 : maxLength + 2;
  });

  return await workbook.xlsx.writeBuffer();
};

// Export multiple sheets to Excel
exports.exportMultipleSheets = async (sheets) => {
  const workbook = new ExcelJS.Workbook();

  for (const { data, name } of sheets) {
    const worksheet = workbook.addWorksheet(name);

    if (data && data.length > 0) {
      const headers = Object.keys(data[0]);
      worksheet.columns = headers.map((header) => ({
        header:
          header.charAt(0).toUpperCase() +
          header.slice(1).replace(/([A-Z])/g, " $1"),
        key: header,
        width: 15,
      }));

      data.forEach((row) => {
        worksheet.addRow(row);
      });

      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    }
  }

  return await workbook.xlsx.writeBuffer();
};
