/**
 * Google Apps Script - ASO Data Connector
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet
 * 2. Click Extensions > Apps Script
 * 3. Delete any existing code
 * 4. Paste this entire code
 * 5. Click Deploy > New deployment
 * 6. Choose "Web app"
 * 7. Set "Execute as" to "Me"
 * 8. Set access to the least-permissive option that works for your deployment
 * 9. Treat the Web App URL as sensitive because it can expose sheet data
 * 10. Click Deploy
 * 11. Copy the Web App URL and paste it into your ASO app
 */

function doGet(e) {
    const action = e.parameter.action;

    if (action === 'getTabs') {
        return getTabs();
    } else if (action === 'getData') {
        const tabName = e.parameter.tab;
        return getData(tabName);
    }

    return ContentService.createTextOutput(JSON.stringify({
        error: 'Invalid action. Use ?action=getTabs or ?action=getData&tab=TabName'
    })).setMimeType(ContentService.MimeType.JSON);
}

function getTabs() {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheets = ss.getSheets();
        const tabNames = sheets.map(sheet => sheet.getName());

        return ContentService.createTextOutput(JSON.stringify({
            success: true,
            tabs: tabNames
        })).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

function getData(tabName) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(tabName);

        if (!sheet) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'Tab not found: ' + tabName
            })).setMimeType(ContentService.MimeType.JSON);
        }

        const rawData = sheet.getDataRange().getValues();

        // Convert Date objects to YYYY-MM-DD strings
        const data = rawData.map(function (row) {
            return row.map(function (cell) {
                if (Object.prototype.toString.call(cell) === '[object Date]') {
                    // Format as YYYY-MM-DD
                    var year = cell.getFullYear();
                    var month = String(cell.getMonth() + 1).padStart(2, '0');
                    var day = String(cell.getDate()).padStart(2, '0');
                    return year + '-' + month + '-' + day;
                }
                return cell;
            });
        });

        return ContentService.createTextOutput(JSON.stringify({
            success: true,
            data: data
        })).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}
