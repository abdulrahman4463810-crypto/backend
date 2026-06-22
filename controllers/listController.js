const ListItem = require("../models/ListItem");
const audit = require("../services/auditService");

function clean(body) {
  return {
    group: String(body.group || "").trim(),
    value: String(body.value || "").trim(),
  };
}

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

function isMachineGroup(group) {
  const g = norm(group);

  return (
    g.includes("machine") ||
    g.includes("equipment") ||
    g.includes("equip") ||
    g.includes("machine name") ||
    g.includes("equipment name")
  );
}

function listDto(row, no) {
  const machineGroup = isMachineGroup(row.group);

  const item = {
    id: String(row._id),
    _id: String(row._id),
    no,
    srNo: no,
    number: no,
    group: row.group,
    value: row.value,
    label: row.value,
    name: row.value,
  };

  /*
    IMPORTANT:
    MachineDashboard ko numeric IDs 1,2,3,7,10 etc ko name me convert
    karne ke liye ye fields help karengi.
  */
  if (machineGroup) {
    item.machineId = no;
    item.equipmentId = no;
    item.machineName = row.value;
    item.equipmentName = row.value;
    item.machine = row.value;
    item.equipment = row.value;
  }

  return item;
}

exports.getLists = async (req, res, next) => {
  try {
    const rows = await ListItem.find().sort({
      group: 1,
      createdAt: 1,
      value: 1,
    });

    const grouped = {};
    const groupCounter = {};

    rows.forEach((row) => {
      const group = row.group;

      grouped[group] = grouped[group] || [];
      groupCounter[group] = (groupCounter[group] || 0) + 1;

      grouped[group].push(listDto(row, groupCounter[group]));
    });

    res.json(grouped);
  } catch (e) {
    next(e);
  }
};

exports.createList = async (req, res, next) => {
  try {
    const payload = clean(req.body);

    if (!payload.group || !payload.value) {
      return res.status(400).json({
        message: "Group and value are required",
      });
    }

    const row = await ListItem.findOneAndUpdate(
      payload,
      { $setOnInsert: payload },
      { upsert: true, new: true }
    );

    await audit(req, "CREATE", "LIST", payload);

    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
};

exports.updateList = async (req, res, next) => {
  try {
    const payload = clean(req.body);

    if (!payload.group || !payload.value) {
      return res.status(400).json({
        message: "Group and value are required",
      });
    }

    const duplicate = await ListItem.findOne({
      group: payload.group,
      value: payload.value,
      _id: { $ne: req.params.id },
    });

    if (duplicate) {
      return res.status(400).json({
        message: "This list value already exists",
      });
    }

    const row = await ListItem.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!row) {
      return res.status(404).json({
        message: "List item not found",
      });
    }

    await audit(req, "UPDATE", "LIST", {
      id: req.params.id,
      ...payload,
    });

    res.json(row);
  } catch (e) {
    next(e);
  }
};

exports.deleteList = async (req, res, next) => {
  try {
    const row = await ListItem.findByIdAndDelete(req.params.id);

    if (!row) {
      return res.status(404).json({
        message: "List item not found",
      });
    }

    await audit(req, "DELETE", "LIST", row.toObject());

    res.json({
      message: "Deleted",
    });
  } catch (e) {
    next(e);
  }
};

function cellToText(cell) {
  const value = cell?.value;

  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    if (value.text) return String(value.text).trim();

    if (value.result !== undefined) {
      return String(value.result ?? "").trim();
    }

    if (value.richText) {
      return value.richText.map((x) => x.text || "").join("").trim();
    }
  }

  return String(value).trim();
}

exports.importLists = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        message: "Excel file is required",
      });
    }

    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();

    await wb.xlsx.load(req.file.buffer);

    const items = [];

    wb.worksheets.forEach((ws) => {
      /*
        Mode 1:
        First row me group names hon:
        Machine Name | Category | UOM | Supplier
        Neechy values hon.
      */
      const headerRow = ws.getRow(1);
      const headers = [];

      for (
        let c = 1;
        c <= Math.max(ws.columnCount || 0, headerRow.cellCount || 0);
        c += 1
      ) {
        headers.push(cellToText(headerRow.getCell(c)) || `Column ${c}`);
      }

      for (let c = 1; c <= headers.length; c += 1) {
        const group = headers[c - 1];

        if (!group || /^column\s+\d+$/i.test(group)) continue;

        for (let r = 2; r <= ws.rowCount; r += 1) {
          const value = cellToText(ws.getRow(r).getCell(c));

          if (value) {
            items.push({
              group,
              value,
            });
          }
        }
      }

      /*
        Mode 2:
        Sheet me Group + Value headers kahin bhi hon.
      */
      for (let r = 1; r <= Math.min(ws.rowCount, 20); r += 1) {
        const row = ws.getRow(r);

        const values = row.values.map((v) =>
          String(v || "").toLowerCase().trim()
        );

        const groupIndex = values.findIndex((v) =>
          ["group", "list", "category", "type"].includes(v)
        );

        const valueIndex = values.findIndex((v) =>
          ["value", "name", "item", "machine", "equipment"].includes(v)
        );

        if (groupIndex > 0 && valueIndex > 0) {
          for (let rr = r + 1; rr <= ws.rowCount; rr += 1) {
            const group = cellToText(ws.getRow(rr).getCell(groupIndex));
            const value = cellToText(ws.getRow(rr).getCell(valueIndex));

            if (group && value) {
              items.push({
                group,
                value,
              });
            }
          }

          break;
        }
      }
    });

    const unique = new Map();

    items.forEach((item) => {
      const payload = clean(item);

      if (payload.group && payload.value) {
        unique.set(`${payload.group}|||${payload.value}`, payload);
      }
    });

    const rows = Array.from(unique.values());

    for (const payload of rows) {
      await ListItem.findOneAndUpdate(
        payload,
        { $setOnInsert: payload },
        { upsert: true, new: true }
      );
    }

    await audit(req, "IMPORT", "LIST", {
      count: rows.length,
    });

    res.status(201).json({
      message: "List file imported",
      imported: rows.length,
    });
  } catch (e) {
    next(e);
  }
};

exports.deleteAllLists = async (req, res, next) => {
  try {
    const result = await ListItem.deleteMany({});

    await audit(req, "DELETE_ALL", "LIST", {
      deleted: result.deletedCount,
    });

    res.json({
      message: "All list items deleted",
      deleted: result.deletedCount,
    });
  } catch (e) {
    next(e);
  }
};
