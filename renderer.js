const { ipcRenderer } = require('electron');

let items = [];
let currentSort = { column: 'ratio', direction: 'desc' };

// Parse items from text
function parseItems(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const items = [];
    let currentItem = null;

    for (const line of lines) {
        if (!line.startsWith('RAP') && !line.startsWith('Price')) {
            if (currentItem && currentItem.name && currentItem.rap && currentItem.price) {
                items.push(currentItem);
            }
            currentItem = { name: line, rap: null, price: null };
        } else if (line.startsWith('RAP')) {
            const match = line.match(/([\d.,]+)([MK])/);
            if (match) {
                const num = parseFloat(match[1].replace(',', ''));
                const multiplier = match[2] === 'K' ? 1000 : 1000000;
                currentItem.rap = num * multiplier;
            }
        } else if (line.startsWith('Price')) {
            const match = line.match(/\$+([\d,]+)/);
            if (match) {
                currentItem.price = parseInt(match[1].replace(',', ''));
            }
        }
    }

    if (currentItem && currentItem.name && currentItem.rap && currentItem.price) {
        items.push(currentItem);
    }

    return items;
}

// Update the table with filtered items
function updateTable() {
    const maxBudget = parseInt(document.getElementById('budget').value) || 0;
    const minRap = parseInt(document.getElementById('minRap').value) || 0;
    const minPrice = parseInt(document.getElementById('minPrice').value) || 0;

    const filteredItems = items.filter(item => 
        item.price <= maxBudget &&
        item.rap >= minRap &&
        item.price >= minPrice
    );

    filteredItems.forEach(item => {
        item.ratio = item.rap / item.price;
    });

    // Sort items
    filteredItems.sort((a, b) => {
        const multiplier = currentSort.direction === 'desc' ? -1 : 1;
        if (currentSort.column === 'ratio') {
            return multiplier * (a.ratio - b.ratio);
        } else if (currentSort.column === 'name') {
            return multiplier * a.name.localeCompare(b.name);
        } else {
            return multiplier * (a[currentSort.column] - b[currentSort.column]);
        }
    });

    const tbody = document.getElementById('itemsBody');
    tbody.innerHTML = '';

    filteredItems.forEach((item, index) => {
        const row = document.createElement('tr');
        if (index < 3) {
            row.classList.add('best-deal');
        }
        row.innerHTML = `
            <td>${item.name}</td>
            <td>$${item.price.toLocaleString()}</td>
            <td>$${item.rap.toLocaleString()}</td>
            <td>${item.ratio.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('status').textContent = 
        `Showing ${filteredItems.length} items (Max Budget: $${maxBudget.toLocaleString()}, Min RAP: $${minRap.toLocaleString()}, Min Price: $${minPrice.toLocaleString()})`;
}

// Event Listeners
document.getElementById('searchBtn').addEventListener('click', updateTable);
document.getElementById('loadBtn').addEventListener('click', () => {
    ipcRenderer.send('open-file-dialog');
});

// Handle file content
ipcRenderer.on('file-content', (event, content) => {
    items = parseItems(content);
    if (items.length === 0) {
        document.getElementById('status').textContent = 'No items found in the file.';
        return;
    }
    updateTable();
});

// Handle sorting
document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const column = th.dataset.sort;
        if (currentSort.column === column) {
            currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
        } else {
            currentSort.column = column;
            currentSort.direction = 'desc';
        }
        updateTable();
    });
}); 