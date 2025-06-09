const { ipcRenderer } = require('electron');

let items = [];
let rolimonsData = null;
let sortOrder = [{ column: 'ratio', direction: 'desc' }]; // default
let processedItems = []; // Cache for processed items

// Modal logic
const pasteBtn = document.getElementById('pasteBtn');
const pasteModal = document.getElementById('pasteModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const processPasteBtn = document.getElementById('processPasteBtn');
const rawPaste = document.getElementById('rawPaste');

pasteBtn.addEventListener('click', () => {
    pasteModal.style.display = 'flex';
});
closeModalBtn.addEventListener('click', () => {
    pasteModal.style.display = 'none';
});
window.addEventListener('click', (e) => {
    if (e.target === pasteModal) pasteModal.style.display = 'none';
});

// Normalize item names for matching
function normalizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/gi, '').trim();
}

// Fetch Rolimons data
async function fetchRolimonsData() {
    try {
        const response = await fetch('https://www.rolimons.com/itemapi/itemdetails');
        const data = await response.json();
        if (data.success) {
            rolimonsData = data.items;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error fetching Rolimons data:', error);
        return false;
    }
}

// Check if item is projected
function isProjected(itemName) {
    if (!rolimonsData) return false;
    const normName = normalizeName(itemName);
    for (const item of Object.values(rolimonsData)) {
        if (normalizeName(item[0]) === normName) {
            return item[7] === 1;
        }
    }
    return false;
}

// Parse pasted website text (pattern: name, name, RAP, value, Price, value)
function parsePastedItems(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const items = [];
    let i = 0;
    while (i < lines.length - 5) {
        const name1 = lines[i];
        const name2 = lines[i + 1];
        const rap_label = lines[i + 2].toLowerCase();
        const rap_val = lines[i + 3];
        const price_label = lines[i + 4].toLowerCase();
        const price_val = lines[i + 5];
        if (
            name1 === name2 &&
            rap_label === 'rap' &&
            price_label === 'price' &&
            /[\d,.]+[KM]?$/i.test(rap_val) &&
            /\$?[\d,]+$/.test(price_val)
        ) {
            // Normalize RAP and price formatting
            const cleaned_rap = rap_val.toUpperCase().replace(/\s/g, '');
            const cleaned_price = price_val.replace(/\$/g, '').replace(/,/g, '');
            items.push({
                name: name1,
                rap: parseRAP(cleaned_rap),
                price: parseInt(cleaned_price)
            });
            i += 6;
        } else {
            i += 1;
        }
    }
    return items;
}

function parseRAP(rapStr) {
    // e.g. 4.3M, 180K, 720K
    const match = rapStr.match(/([\d,.]+)([MK]?)/i);
    if (!match) return 0;
    let num = parseFloat(match[1].replace(/,/g, ''));
    let mult = 1;
    if (match[2] === 'K') mult = 1000;
    if (match[2] === 'M') mult = 1000000;
    return Math.round(num * mult);
}

// Process all items with Rolimons data
function processItems() {
    processedItems = items.map(item => ({
        ...item,
        ratio: item.price ? item.rap / item.price : 0,
        projected: isProjected(item.name)
    }));
}

// Update the table with filtered items
function updateTable() {
    const maxBudgetRaw = document.getElementById('budget').value;
    const maxBudget = maxBudgetRaw === '' ? Infinity : parseInt(maxBudgetRaw);
    const minRap = parseInt(document.getElementById('minRap').value) || 0;
    const minPrice = parseInt(document.getElementById('minPrice').value) || 0;

    let filteredItems = processedItems.filter(item => 
        item.price <= maxBudget &&
        item.rap >= minRap &&
        item.price >= minPrice
    );

    // Always sort projected items to the bottom, then by selected columns (multi-column sort)
    filteredItems.sort((a, b) => {
        if (a.projected !== b.projected) return a.projected ? 1 : -1;
        for (const sort of sortOrder) {
            const multiplier = sort.direction === 'desc' ? -1 : 1;
            let cmp = 0;
            if (sort.column === 'ratio') cmp = multiplier * (a.ratio - b.ratio);
            else if (sort.column === 'name') cmp = multiplier * a.name.localeCompare(b.name);
            else cmp = multiplier * (a[sort.column] - b[sort.column]);
            if (cmp !== 0) return cmp;
        }
        return 0;
    });

    const tbody = document.getElementById('itemsBody');
    tbody.innerHTML = '';

    if (filteredItems.length === 0) {
        const row = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = 'No items match your filters.';
        td.style.textAlign = 'center';
        row.appendChild(td);
        tbody.appendChild(row);
    } else {
        filteredItems.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    ${item.name}
                    ${item.projected ? ' ⚠️' : ''}
                </td>
                <td>$${item.price.toLocaleString()}</td>
                <td>$${item.rap.toLocaleString()}</td>
                <td>${item.ratio.toFixed(2)}</td>
            `;
            tbody.appendChild(row);
        });
    }
    document.getElementById('status').textContent = `Showing ${filteredItems.length} items`;
    updateSortIndicators();
}

// Event Listeners
document.getElementById('budget').addEventListener('input', updateTable);
document.getElementById('minRap').addEventListener('input', updateTable);
document.getElementById('minPrice').addEventListener('input', updateTable);
processPasteBtn.addEventListener('click', async () => {
    const rawText = rawPaste.value;
    if (!rawText.trim()) {
        alert('Please paste the copied website text.');
        return;
    }
    document.getElementById('status').textContent = 'Loading Rolimons data...';
    items = parsePastedItems(rawText);
    if (items.length === 0) {
        document.getElementById('status').textContent = 'No valid items found in the pasted text.';
        pasteModal.style.display = 'none';
        return;
    }
    await fetchRolimonsData();
    processItems();
    updateTable();
    pasteModal.style.display = 'none';
    rawPaste.value = '';
});

// Update sorting logic to allow multi-column
const ths = document.querySelectorAll('th[data-sort]');
ths.forEach(th => {
    th.addEventListener('click', (e) => {
        const column = th.dataset.sort;
        const existing = sortOrder.find(s => s.column === column);
        if (e.ctrlKey || e.metaKey) {
            // Ctrl+Click (or Cmd+Click on Mac): add or toggle direction in sortOrder
            if (existing) {
                existing.direction = existing.direction === 'desc' ? 'asc' : 'desc';
            } else {
                sortOrder.push({ column, direction: 'desc' });
            }
        } else {
            // Regular click: set as primary sort, reset others
            if (existing) {
                existing.direction = existing.direction === 'desc' ? 'asc' : 'desc';
                sortOrder = [existing];
            } else {
                sortOrder = [{ column, direction: 'desc' }];
            }
        }
        updateTable();
        updateSortIndicators();
    });
});

function updateSortIndicators() {
    ths.forEach(th => {
        const col = th.dataset.sort;
        th.innerHTML = th.textContent.replace(/\s*[↑↓\d]*$/, ''); // Remove old indicators
        const idx = sortOrder.findIndex(s => s.column === col);
        if (idx !== -1) {
            const dir = sortOrder[idx].direction === 'desc' ? '↓' : '↑';
            th.innerHTML += ` <span class="sort-indicator" style="font-size:0.9em; color:#00FF01;">${idx+1}${dir}</span>`;
        }
    });
} 