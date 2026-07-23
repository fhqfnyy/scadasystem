import { Workbook } from 'exceljs';
import {
    Device,
    DeviceType,
    ModbusTagType,
    Tag,
    TagDaq,
    TagType,
    TAG_PREFIX
} from '../_models/device';
import { Utils } from '../_helpers/utils';

export interface ExcelTagImportResult {
    devices: Device[];
    added: number;
    updated: number;
}

interface ExcelTagRow {
    row: number;
    device: string;
    name: string;
    type: string;
    address: string;
    memoryAddress: string;
    description: string;
    unit: string;
    writable: string;
    divisor: string;
    format: string;
    daqEnabled: string;
    daqInterval: string;
}

const headerAliases: {[key: string]: keyof ExcelTagRow} = {
    device: 'device', driver: 'device', '设备': 'device', '驱动': 'device',
    name: 'name', path: 'name', '变量名': 'name', '变量路径': 'name',
    type: 'type', '类型': 'type', '数据类型': 'type',
    address: 'address', '地址': 'address', '设备地址': 'address',
    memoryaddress: 'memoryAddress', memaddress: 'memoryAddress', '存储区': 'memoryAddress',
    description: 'description', '描述': 'description',
    unit: 'unit', '单位': 'unit',
    writable: 'writable', '可写': 'writable',
    divisor: 'divisor', '除数': 'divisor',
    format: 'format', '小数位': 'format',
    daqenabled: 'daqEnabled', '历史存储': 'daqEnabled',
    daqinterval: 'daqInterval', '存储周期': 'daqInterval'
};

function cellText(cell: any): string {
    if (cell.value === null || cell.value === undefined) {
        return '';
    }
    if (typeof cell.value === 'object' && Object.prototype.hasOwnProperty.call(cell.value, 'result')) {
        return `${cell.value.result ?? ''}`.trim();
    }
    return `${cell.text ?? cell.value}`.trim();
}

function boolValue(value: string, fallback = false): boolean {
    if (!value) {
        return fallback;
    }
    return /^(true|1|yes|是)$/i.test(value);
}

function normalizeType(device: Device, type: string, row: number): string {
    const allowed = device.type === DeviceType.SiemensS7
        ? Object.values(TagType)
        : (device.type === DeviceType.ModbusTCP || device.type === DeviceType.ModbusRTU)
            ? Object.values(ModbusTagType)
            : null;
    if (!allowed) {
        if (!type) {
            throw new Error(`Row ${row}: type is required`);
        }
        return type;
    }
    const match = allowed.find(item => item.toLowerCase() === type.toLowerCase());
    if (!match) {
        throw new Error(`Row ${row}: type '${type}' is invalid for ${device.type}`);
    }
    return match;
}

function parseModbusAddress(rawAddress: string, rawMemoryAddress: string, row: number) {
    if (rawMemoryAddress) {
        const address = Number(rawAddress);
        if (!Number.isInteger(address) || address < 1 || address > 65536) {
            throw new Error(`Row ${row}: Modbus address must be between 1 and 65536`);
        }
        return { address: `${address}`, memoryAddress: rawMemoryAddress };
    }
    const compact = rawAddress.replace(/\s/g, '');
    if (!/^[0134]\d{4,5}$/.test(compact)) {
        throw new Error(`Row ${row}: use a Modbus address such as 000001, 100001, 300001 or 400001`);
    }
    const normalized = compact.length === 5 ? `${compact[0]}${compact}` : compact;
    return {
        address: `${Number(normalized.slice(1))}`,
        memoryAddress: `${normalized[0]}00000`
    };
}

export class ExcelTagImport {
    static async createTemplate(devices: Device[]): Promise<any> {
        const workbook = new Workbook();
        workbook.creator = 'ForgeControl for FUXA';
        const sheet = workbook.addWorksheet('Variables', {views: [{state: 'frozen', ySplit: 1}]});
        sheet.columns = [
            {header: 'device', key: 'device', width: 24},
            {header: 'path', key: 'path', width: 28},
            {header: 'type', key: 'type', width: 16},
            {header: 'address', key: 'address', width: 22},
            {header: 'memoryAddress', key: 'memoryAddress', width: 18},
            {header: 'description', key: 'description', width: 32},
            {header: 'unit', key: 'unit', width: 12},
            {header: 'writable', key: 'writable', width: 12},
            {header: 'divisor', key: 'divisor', width: 12},
            {header: 'format', key: 'format', width: 12},
            {header: 'daqEnabled', key: 'daqEnabled', width: 14},
            {header: 'daqInterval', key: 'daqInterval', width: 14}
        ];
        const firstDevice = devices.find(device =>
            device.type === DeviceType.SiemensS7 ||
            device.type === DeviceType.ModbusTCP ||
            device.type === DeviceType.ModbusRTU
        );
        sheet.addRow({
            device: firstDevice?.name || 'PLC-1',
            path: 'Reactor.Temperature',
            type: firstDevice?.type === DeviceType.SiemensS7 ? 'Real' : 'Float32',
            address: firstDevice?.type === DeviceType.SiemensS7 ? 'DB1.DBD0' : '400001',
            memoryAddress: '',
            description: 'Reactor temperature',
            unit: '°C',
            writable: false,
            divisor: 1,
            format: 1,
            daqEnabled: true,
            daqInterval: 60
        });
        sheet.getRow(1).font = {bold: true, color: {argb: 'FFFFFFFF'}};
        sheet.getRow(1).fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF3F51B5'}};
        sheet.autoFilter = 'A1:L1';
        const deviceNames = devices
            .filter(device => device.type !== DeviceType.FuxaServer)
            .map(device => device.name)
            .filter(Boolean);
        for (let row = 2; row <= 1000; row++) {
            if (deviceNames.length) {
                sheet.getCell(`A${row}`).dataValidation = {
                    type: 'list',
                    allowBlank: false,
                    formulae: [`"${deviceNames.join(',').replace(/"/g, '""')}"`]
                };
            }
            sheet.getCell(`H${row}`).dataValidation = {
                type: 'list', allowBlank: false, formulae: ['"true,false"']
            };
            sheet.getCell(`K${row}`).dataValidation = {
                type: 'list', allowBlank: false, formulae: ['"true,false"']
            };
        }
        const help = workbook.addWorksheet('Instructions');
        help.columns = [{width: 22}, {width: 82}];
        [
            ['Column', 'Description'],
            ['device', 'Existing FUXA device id or name'],
            ['path', 'Variable name; existing names in the same device are updated'],
            ['type', 'S7: Bool/Byte/Int/Word/DInt/DWord/Real. Modbus: Bool/Int16/UInt16/Int32/UInt32/Float32/...'],
            ['address', 'S7 example DB1.DBD0. Modbus example 000001, 100001, 300001 or 400001'],
            ['memoryAddress', 'Optional explicit FUXA Modbus memory area; leave empty for full Modbus addresses'],
            ['writable', 'true or false'],
            ['daqEnabled / daqInterval', 'Enable history and set its interval in seconds']
        ].forEach(row => help.addRow(row));
        help.getRow(1).font = {bold: true};
        return workbook.xlsx.writeBuffer();
    }

    static async parse(buffer: ArrayBuffer, currentDevices: Device[]): Promise<ExcelTagImportResult> {
        if (buffer.byteLength > 5 * 1024 * 1024) {
            throw new Error('Excel file exceeds the 5 MB limit');
        }
        const workbook = new Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) {
            throw new Error('The workbook does not contain a worksheet');
        }
        if (sheet.rowCount > 10001) {
            throw new Error('A maximum of 10000 variables can be imported at once');
        }

        const columns = new Map<keyof ExcelTagRow, number>();
        sheet.getRow(1).eachCell((cell, column) => {
            const header = cellText(cell).replace(/\s/g, '');
            const key = headerAliases[header.toLowerCase()] || headerAliases[header];
            if (key) {
                columns.set(key, column);
            }
        });
        const required = <(keyof ExcelTagRow)[]>['device', 'name', 'type', 'address'];
        const missing = required.filter(key => !columns.has(key));
        if (missing.length) {
            throw new Error(`Missing required columns: ${missing.join(', ')}`);
        }

        const devices = currentDevices
            .filter(device => device.type !== DeviceType.FuxaServer)
            .map(device => <Device>JSON.parse(JSON.stringify(device)));
        const affected = new Set<string>();
        const importedKeys = new Set<string>();
        let added = 0;
        let updated = 0;

        for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
            const get = (key: keyof ExcelTagRow) => columns.has(key)
                ? cellText(sheet.getRow(rowNumber).getCell(columns.get(key)))
                : '';
            const row: ExcelTagRow = {
                row: rowNumber,
                device: get('device'),
                name: get('name'),
                type: get('type'),
                address: get('address'),
                memoryAddress: get('memoryAddress'),
                description: get('description'),
                unit: get('unit'),
                writable: get('writable'),
                divisor: get('divisor'),
                format: get('format'),
                daqEnabled: get('daqEnabled'),
                daqInterval: get('daqInterval')
            };
            if (!row.device && !row.name && !row.address) {
                continue;
            }
            const device = devices.find(item => item.id === row.device || item.name === row.device);
            if (!device) {
                throw new Error(`Row ${rowNumber}: device '${row.device}' does not exist`);
            }
            if (!row.name || row.name.includes('@')) {
                throw new Error(`Row ${rowNumber}: variable name is empty or contains '@'`);
            }
            const importKey = `${device.id}:${row.name}`;
            if (importedKeys.has(importKey)) {
                throw new Error(`Row ${rowNumber}: duplicate variable '${row.name}' for device '${device.name}'`);
            }
            importedKeys.add(importKey);

            device.tags = device.tags || {};
            let tag = <Tag>Object.values(device.tags).find((item: Tag) => item.name === row.name);
            if (tag) {
                updated++;
            } else {
                tag = new Tag(Utils.getGUID(TAG_PREFIX));
                tag.name = row.name;
                tag.daq = new TagDaq(false, false, 60);
                device.tags[tag.id] = tag;
                added++;
            }
            tag.type = normalizeType(device, row.type, rowNumber);
            if (device.type === DeviceType.ModbusTCP || device.type === DeviceType.ModbusRTU) {
                const parsed = parseModbusAddress(row.address, row.memoryAddress, rowNumber);
                tag.address = parsed.address;
                tag.memaddress = parsed.memoryAddress;
            } else {
                tag.address = row.address;
            }
            tag.description = row.description;
            tag.access = boolValue(row.writable) ? 'readwrite' : 'read';
            tag.divisor = row.divisor ? Number(row.divisor) : 1;
            tag.format = row.format ? Number(row.format) : 0;
            tag.daq = new TagDaq(boolValue(row.daqEnabled), true, row.daqInterval ? Number(row.daqInterval) : 60);
            (<any>tag).unit = row.unit;
            affected.add(device.id);
        }
        return { devices: devices.filter(device => affected.has(device.id)), added, updated };
    }
}
