<style>
    .swal2-container{
        z-index: 99999999999;
    }
</style>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@10"></script>


<div id="dataCrud">

</div>



<script>


if (getpar("name") == "") {
    $("#dataCrud").html(`<h1 style='text-align:center;color:red;'>No Data !</h1>`);
} else {
    $("#dataCrud").html(`
        <crud-table name="${getpar("name")}" top="${Number(getpar("top")) >0  ?getpar("top") : 25}" page="${Number(getpar("page")) >0  ?getpar("page") : 1}" cond="${getpar("cond")}" cols="${getpar("cols")}"></crud-table>
    `);

    let searchObjectsData = {};

class AutoCompleteTable extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.name = this.getAttribute('name');
        this.records = parseInt(this.getAttribute('records')) || 10;
        this.page = 1;
        this.data = [];
        this.filteredData = [];
        this.selectedIndex = -1;
        this.isClickOutsideListenerAdded = false;

        this.shadowRoot.innerHTML = `
            <style>
                .autocomplete-container {
                    position: absolute;
                    border: 1px solid #ccc;
                    background-color: #1a2035;
                    color: white;
                }

                .autocomplete-input {
                    width: 100%;
                    padding: 10px;
                    box-sizing: border-box;
                    color: white;
                    background-color: #1a2035;
                    border: none;
                    outline: none;
                    font-size: 19px;
                }

                .autocomplete-results {
                    max-height: 350px;
                    overflow: auto;
                }

                .autocomplete-results table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .autocomplete-results th, .autocomplete-results td {
                    padding: 8px;
                    border: 1px solid #ddd;
                    text-align: left;
                }

                .autocomplete-results th {
                    background-color: #343a40;
                }

                .autocomplete-results tr:hover {
                    background-color: #007bff;
                    color: white;
                }

                .pagination {
                    display: flex;
                    justify-content: center;
                    margin-top: 10px;
                }

                .pagination button {
                    padding: 5px 10px;
                    margin: 0 5px;
                    cursor: pointer;
                    background-color: #343a40;
                    color: white;
                    border: none;
                }

                .pagination button:hover {
                    background-color: #007bff;
                }

                .selected {
                    background-color: #007bff;
                    color: white;
                }
            </style>
            <div class="autocomplete-container" style="display: none;">
                <div class="autocomplete-results">
                    <table>
                        <thead>
                            <tr></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                    <div class="pagination">
                        <button class="prev-page">&lt;&lt;</button>
                        <button class="next-page">&gt;&gt;</button>
                    </div>
                </div>
            </div>
        `;

        this.resultsContainer = this.shadowRoot.querySelector('.autocomplete-container');
        this.thead = this.shadowRoot.querySelector('thead tr');
        this.tbody = this.shadowRoot.querySelector('tbody');
        this.prevPageButton = this.shadowRoot.querySelector('.prev-page');
        this.nextPageButton = this.shadowRoot.querySelector('.next-page');

        this.prevPageButton.addEventListener('click', () => this.changePage(-1));
        this.nextPageButton.addEventListener('click', () => this.changePage(1));
        this.handleClickOutsideBound = this.handleClickOutside.bind(this);
    }

    connectedCallback() {
        setStopPropagationForChildren(this.shadowRoot);
    }

    set data(newData) {
        this._data = newData;
        this.filteredData = newData.slice();
        this.updateResults();
    }

    get data() {
        return this._data;
    }

    setInput(input, data, column) {
        this.data = data;
        this.filteredData = this.data;
        this.input = input;
        this.column = column;
        setStopPropagationForChildren(this.input);
        input.addEventListener('input', () => this.onInput(input));
        input.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.updateResults();
    }

    onInput(input) {
        let query = input.value ? input.value : input.querySelector("input") ? input.querySelector("input").value || "" : "";
        query = query.toLowerCase();
console.log(input)
this.filteredData = this.data.filter(item => 
        Object.values(item).some(value => 
            typeof value === 'string' && value.toLowerCase().includes(query)
        )
    );
        this.page = 1;
        this.updateResults();
    }

    onKeyDown(e) {
        const rows = this.tbody.querySelectorAll('tr');
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = (this.selectedIndex + 1) % rows.length;
                this.updateHighlight();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = (this.selectedIndex - 1 + rows.length) % rows.length;
                this.updateHighlight();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    this.selectItem(rows[this.selectedIndex]);
                }
                break;
        }
    }

    updateHighlight() {
        const rows = this.tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            row.classList.toggle('selected', index === this.selectedIndex);
        });
    }

    changePage(direction) {
        const totalPages = Math.ceil(this.filteredData.length / this.records);
        this.page = Math.max(1, Math.min(this.page + direction, totalPages));
        this.updateResults();
    }

    updateResults() {
        if (!this.thead || !this.tbody) {
            return;
        }

        const start = (this.page - 1) * this.records;
        const end = this.page * this.records;
        const pageData = this.filteredData.slice(start, end);

        this.tbody.innerHTML = '';
        this.thead.innerHTML = '';

        if (pageData.length > 0) {
            let countcol = 0;
            Object.keys(pageData[0]).forEach(key => {
                if (key.toLowerCase() !== 'id') {
                    const th = document.createElement('th');
                    if (countcol == 0) {
                        const thspantext = document.createElement('span');
                        const thspanclose = document.createElement('span');
                        thspanclose.style.position = 'absolute';
                        thspanclose.style.zIndex = '999999';
                        thspanclose.addEventListener('click', (e) => {
                            this.remove();
                        });
                        thspantext.textContent = key;
                        thspanclose.textContent = " X ";
                        thspantext.style.paddingLeft = '20px';
                        thspantext.style.paddingRight = '20px';
                        th.appendChild(thspanclose);
                        th.appendChild(thspantext);
                    } else {
                        th.textContent = key;
                    }
                    countcol += 1;
                    this.thead.appendChild(th);
                }
            });

            pageData.forEach(item => {
                const tr = document.createElement('tr');
                tr.dataset.id = item.ID;
                Object.entries(item).forEach(([key, value]) => {
                    if (key.toLowerCase() !== 'id') {
                        const td = document.createElement('td');
                        td.textContent = value;
                        tr.appendChild(td);
                        td.addEventListener('click', () => this.selectItem(tr));
                    }
                });
                tr.addEventListener('click', () => this.selectItem(tr));
                this.tbody.appendChild(tr);
            });
        }

        this.resultsContainer.style.display = pageData.length > 0 ? 'block' : 'none';

        if (pageData.length > 0 && !this.isClickOutsideListenerAdded) {
            document.addEventListener('click', this.handleClickOutsideBound);
            this.isClickOutsideListenerAdded = true;
        } else if (pageData.length === 0 && this.isClickOutsideListenerAdded) {
            document.removeEventListener('click', this.handleClickOutsideBound);
            this.isClickOutsideListenerAdded = false;
        }
    }

    selectItem(row) {
        const id = row.dataset.id;
        const selectedItem = this.filteredData.find(item => item.ID.toString() === id);

        if (selectedItem) {
            const value = Object.values(selectedItem).find((val, index) => index > 0); // القيمة الأولى بعد الـ ID

            if (value) {
                this.input.value = value.toString().trim();
            } else {
                this.input.value = row.textContent.trim();
            }
            this.input.dataset.id = id;
            this.input.dataset.val = this.input.value;
            this.resultsContainer.style.display = 'none';
            this.dispatchEvent(new CustomEvent('itemSelected', { detail: { id, value: this.input.value } }));
            document.removeEventListener('click', this.handleClickOutsideBound);
        } else {
            console.error("Item not found!");
        }
    }

    handleClickOutside(event) {
        if (!isEventInChild(this.resultsContainer, event) && !isEventInChild(this.input, event)) {
            this.resultsContainer.style.display = 'none';
            document.removeEventListener('click', this.handleClickOutsideBound);
            this.isClickOutsideListenerAdded = false;
        }
    }

    async generateSearch(input,referencedTableName, column,itemObject, callback ) {
        this.column = column;
        this.input =input;
        console.log(input)
        if(!searchObjectsData)
{

  var  searchObjectsData =[];
}

//if(this.isdataloading == true)
//{
 //   return;
//}
        if (searchObjectsData[referencedTableName]) {
            if (Object.keys(searchObjectsData[referencedTableName]).length == 2) {
                this.populateAutocomplete(input, searchObjectsData[referencedTableName],itemObject);
            } else {
                this.tablepopulateAutocomplete(input, searchObjectsData[referencedTableName], column,itemObject);
            }
            try {
                callback(searchObjectsData[referencedTableName]);
            } catch (err) {
                console.error(err);
            }
        } else {

            //this.isdataloading =true;
            const data = await fetch(`../../API/invoice?id=get`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: referencedTableName, top: 1000, page: 1, cols: "ID," + column.search_columns })
            }).then(res => res.json());

           // this.isdataloading =false;
            if(data.error )
            {

console.log(data.error);
return;

            }else{
                searchObjectsData[referencedTableName] = data.data; // Cache the data
            if (Object.keys(data.data).length == 2) {
                this.populateAutocomplete(input, data.data,itemObject);
            } else {
                this.tablepopulateAutocomplete(input, data.data, column,itemObject);
            }
            try {
                callback(searchObjectsData[referencedTableName]);
            } catch (err) {
                console.error(err);
            }
            }

        }
    }

    populateAutocomplete(td, data, itemObject) {
        const existingDatalist = this.shadowRoot.querySelector(`#datalist_${td.dataset.column}`);
        if (existingDatalist) {
            existingDatalist.remove();
        }
        const datalist = document.createElement('datalist');
        datalist.id = `datalist_${td.dataset.column}`;

        data.forEach(item => {
            const option = document.createElement('option');
            let idval = Object.keys(item)
                .filter(key => key.toLocaleLowerCase() == 'id')
                .map(key => item[key])[0];
            option.dataset.id = idval;
            let concatenatedValue = Object.keys(item)
                .filter(key => key !== 'ID')
                .map(key => item[key])
                .join(' ');
            option.value = concatenatedValue;
            datalist.appendChild(option);
        });

        this.shadowRoot.appendChild(datalist);

        let input = td.tagName.toUpperCase() == "INPUT" ? td : td.querySelector('input');
        if (!input) {
            input = document.createElement('input');
            input.setAttribute('list', datalist.id);
            input.value = td.textContent.trim();

            input.style.width = '100%';
            input.style.height = '100%';
            input.style.margin = '0';
            input.style.padding = '10px 4px 10px 4px';
            input.style.border = 'none';
            input.style.outline = 'none';
            input.style.boxSizing = 'border-box';
            input.style.fontSize = '19px';
            td.style.padding = '0';
            td.textContent = '';
            td.appendChild(input);
        } else {
            input.setAttribute('list', datalist.id);
        }

        input.onblur = () => {
            const newValue = input.value.trim();
            if (input && input.tagName.toLowerCase() != 'input') {
                td.removeChild(input);
            }
            if (itemObject) {
                if (input.tagName.toLowerCase() == 'input') {
                    td.value = itemObject.value;
                } else {
                    td.textContent = itemObject.value;
                }
            } else {
                if (input.tagName.toLowerCase() == 'input') {
                    td.value = '';
                } else {
                    td.textContent = '';
                }
            }
            td.style.padding = '';
            
        };

        input.onchange = () => {
            const selectedOption = Array.from(datalist.options).find(option => option.value === input.value);
            if (selectedOption) {
                input.value = selectedOption.value;
                if (itemObject) {
                    itemObject.value = selectedOption.value;
                    itemObject.id = selectedOption.dataset.id;
                }
            }
        };
    }

    removeallpopulateAutocomplete() {
        const existingAutoCompletes = this.shadowRoot.querySelectorAll('auto-complete-table');
        existingAutoCompletes.forEach(autoComplete => {
            autoComplete.remove();
        });
    }

    tablepopulateAutocomplete(td, data, column,itemObject) {
        this.removeallpopulateAutocomplete();

        console.log(td);
        console.log(data);
        console.log(column);
        td.onclick = (e) => {
            e.stopPropagation();
        };

        console.log(td);
        console.log(data);
        console.log(column);
        const autoCompleteTable = this;

        const rect = td.getBoundingClientRect();

        autoCompleteTable.style.position = 'absolute';
        autoCompleteTable.style.width = `${rect.width}px`;
        autoCompleteTable.style.zIndex = getMaxZindex() + 99999;
        autoCompleteTable.setInput(td, data, column);

        const tableRect = this.shadowRoot.host.getBoundingClientRect();
        autoCompleteTable.style.position = 'absolute';
        autoCompleteTable.style.top = `${rect.bottom + window.scrollY}px`;
        autoCompleteTable.style.left = `${rect.left + window.scrollX}px`;
        autoCompleteTable.style.width = `${rect.width}px`;

        let input = td.tagName.toUpperCase() == "INPUT" ? td : td.querySelector('input');
        if (!input) {
            input = document.createElement('input');
            input.value = td.textContent.trim();
            input.style.width = '100%';
            input.style.height = '100%';
            input.style.margin = '0';
            input.style.padding = '10px 4px';
            input.style.border = 'none';
            input.style.outline = 'none';
            input.style.boxSizing = 'border-box';
            input.style.fontSize = '19px';
            td.style.padding = '0';
            td.textContent = '';
            td.appendChild(input);
            input.onclick = (e) => {
                e.stopPropagation();
            };

            input.onblur = () => {
                const newValue = input.value.trim();
                if (input && input.tagName.toLowerCase() != 'input') {
                    td.removeChild(input);
                }
                if(itemObject ==null )
                {
                    itemObject ={id:input.dataset.id ,vlaue:input.dataset.val}
                }
                if (td.tagName.toLowerCase() != 'input' ) 
                {   
                    td.textContent = itemObject ? itemObject.value : '';
                    td.style.padding = '';
                } else {
                    td.value = itemObject ? itemObject.value : '';
                }
            };

            input.onchange = () => {
                const selectedOption = Array.from(autoCompleteTable.shadowRoot.querySelectorAll('tr')).find(option => option.textContent.trim() === input.value.trim());
                if (selectedOption) {
                    input.value = selectedOption.textContent.trim();
                    if (itemObject) {
                        itemObject.value = selectedOption.textContent.trim();
                        itemObject.id = selectedOption.dataset.id;
                    }
                }
            };
        }

        if (!autoCompleteTable.iseventitemSelected) {
            autoCompleteTable.addEventListener('itemSelected', (e) => {
                autoCompleteTable.iseventitemSelected = true;
                const { value, id } = e.detail;
                input.value = value;
                if (itemObject) {
                    itemObject.value = value;
                    itemObject.id = id;
                }

                if (td.tagName.toUpperCase() != "INPUT") {
                    input.remove();
                    td.textContent = value;
                    td.style.padding = '';
                }

                autoCompleteTable.remove();
            });
        }

        input.focus();
    }
}

class MultiSelect extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                #multiSelectSearchInput{
                font-size:17px;
                }

    
                .multi-select {
                    position: relative;
                    display: inline-block;
                    width: 200px;
                    color: #000;
                }
                .select-box {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border: 1px solid #ccc;
                    padding: 5px;
                    background-color: #fff;
                    cursor: pointer;
                }
                .options-container {
                    position: absolute;
                    top: 40px;
                    left: 0;
                    width: 100%;
                    border: 1px solid #ccc;
                    border-top: none;
                    background-color: #fff;
                    height: 500px;
                    max-height: 500px;
                    overflow: auto;
                    z-index: 9999;
                    display: none;
                }
                .option {
                    padding: 5px;
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                }
                .option:hover {
                    background-color: #f1f1f1;
                }
                .option .checkbox {
                    width: 20px;
                    height: 20px;
                    margin-right: 10px;
                }
                .option.selected {
                    background-color: #0000ff; 
                    color: #ffffff; 
                }
                .selected-items {
                    display: none;
                    flex-wrap: wrap;
                    gap: 5px;
                    margin-top: 5px;
                }
                .selected-item {
                    background-color: #007bff;
                    color: #fff;
                    padding: 3px 5px;
                    border-radius: 3px;
                }
                .selected-item span {
                    cursor: pointer;
                    margin-left: 5px;
                }
                .search-input {
                    width: 100%; 
                    padding: 3px; 
                    margin-bottom: 5px;
                    font-size: 16px;
                }
            </style>
            <div class="multi-select">
                <div class="select-box" id="selectBox">
                    <span id="selected-columns">${getCookie("UserLang") == "ar" ? "اختر القيم" : "Select values"}</span>
                    <span>&#9660;</span>
                </div>
                <div class="options-container" id="optionsContainer">
                    <input type="text" id="multiSelectSearchInput" class="search-input" placeholder="${getCookie("UserLang") == "ar" ? "بحث .." : "Search .."}">
                    <div class="option selectalloption ${ this.getAttribute("checked") =="checked" ? "selected" :"" }">
                        <input type="checkbox" class="checkbox" ${ this.getAttribute("checked") =="checked" ? "checked" :"" } id="selectAll" />
                        <label for="selectAll">${getCookie("UserLang") == "ar" ? "تحديد الكل" : "Select All"}</label>
                        </hr>
                    </div>
                </div>
                <div class="selected-items" id="selectedItems"></div>
            </div>
        `;

        this.selectedItems = [];

        this.shadowRoot.getElementById('selectBox').onclick = (event) => this.toggleOptions(event);
        this.shadowRoot.getElementById('selectAll').addEventListener('click', (e) => this.selectAllOptions(e));
        this.shadowRoot.getElementById('multiSelectSearchInput').addEventListener('input', (e) => this.filterOptions(e));
        this.shadowRoot.getElementById('multiSelectSearchInput').onclick = (event) => this.onclickMultiSelectOptions(event);

        document.addEventListener('click', (event) => this.handleClickOutside(event));
    }

    connectedCallback() {
        // No need to call this.populateOptions() here.
    }

    populateOptions(columns) {
        const optionsContainer = this.shadowRoot.getElementById('optionsContainer');
        columns.forEach(column => {
            const option = document.createElement('div');
            option.classList.add('option');
            if(this.getAttribute("checked") =="checked")
        {
            option.classList.add('selected');
        }
        if(this.getAttribute("checked") =="checked")
        {
        this.shadowRoot.getElementById('selected-columns').textContent = (getCookie("UserLang") == "ar" ? "البيانات المختارة " : "Selected data") + `(${columns.length})`;
        }
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('checkbox');
            
            checkbox.value = column.trans_name || column.name;
            checkbox.setAttribute("name", column.name);
            if(this.getAttribute("checked") =="checked")
        {
            checkbox.checked = true; 
        }
     
            checkbox.onclick = (e) => {
                    e.stopPropagation(); 
                    option.classList.toggle('selected', checkbox.checked); // السطر المحدث
                    this.updateSelectedItems(e.target);
                };
            const label = document.createElement('label');
            label.textContent = column.trans_name || column.name;

            option.appendChild(checkbox);
            option.appendChild(label);
            optionsContainer.appendChild(option);

            checkbox.addEventListener('change', () => this.updateSelectedColumns());
           
            option.addEventListener('click', (e) => {
                e.stopPropagation(); 
    checkbox.checked = !checkbox.checked;
    option.classList.toggle('selected', checkbox.checked); // السطر المحدث
    this.updateSelectedColumns();
});
        });
    }

    toggleOptions(event) {
        event.stopPropagation();
        const optionsContainer = this.shadowRoot.getElementById('optionsContainer');
        optionsContainer.style.display = optionsContainer.style.display === 'block' ? 'none' : 'block';
    }

    selectAllOptions(event) {
        event.stopPropagation();
        const isChecked = event.target.checked;
        const checkboxes = this.shadowRoot.querySelectorAll('.option .checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
            checkbox.closest('.option').classList.toggle('selected', isChecked);
        });
        this.updateSelectedColumns();
    }
    onclickMultiSelectOptions(event) {
        event.stopPropagation(); 
    }
    filterOptions(event) {
        const query = event.target.value.toLowerCase();
        const options = this.shadowRoot.querySelectorAll('.option');
        options.forEach(option => {
            const label = option.querySelector('label').textContent.toLowerCase();
            option.style.display = label.includes(query) ? 'flex' : 'none';
        });
    }

    handleClickOutside(event) {
        const multiSelect = this.shadowRoot.querySelector('.multi-select');
        const optionsContainer = this.shadowRoot.getElementById('optionsContainer');
        if (optionsContainer.style.display === 'block' && !multiSelect.contains(event.target)) {
            optionsContainer.style.display = 'none';
        }
    }

    updateSelectedColumns() {
        const selectedItems = [];
        const selectedItemsContainer = this.shadowRoot.getElementById('selectedItems');
        selectedItemsContainer.innerHTML = ''; // Clear previous items

        this.shadowRoot.querySelectorAll('.option .checkbox').forEach(checkbox => {
            if (checkbox.checked) {
                selectedItems.push(checkbox.value);
                const selectedItem = document.createElement('div');
                selectedItem.classList.add('selected-item');
                selectedItem.textContent = checkbox.value;
                selectedItem.innerHTML += `<span>&times;</span>`;
                selectedItemsContainer.appendChild(selectedItem);

                selectedItem.querySelector('span').addEventListener('click', () => {
                    checkbox.checked = false;
                    selectedItemsContainer.removeChild(selectedItem);
                    this.updateSelectedColumns();
                });
            }
        });

        this.selectedItems = selectedItems;
        this.shadowRoot.getElementById('selected-columns').textContent = (getCookie("UserLang") == "ar" ? "البيانات المختارة " : "Selected data") + `(${selectedItems.length})`;
        this.shadowRoot.getElementById('selected-columns').setAttribute('value', selectedItems.join(','));
    }
}

 class CrudNavBar extends HTMLElement {
            constructor() {
                super();
        this.attachShadow({mode: 'open' });

        this.name = this.getAttribute("name");
        this.shadowRoot.innerHTML = `
        <style>
             
 .btn {
        border: none;
        cursor: pointer;
        background: none;
        color: white;
        margin: 0 5px;
        padding: 5px;
        border-radius: 4px;
        transition: transform 0.2s, background-color 0.2s;
    }

    .btn:hover {
        transform: scale(1.5);
        background-color: rgba(0, 123, 255, 0.1);
       
        font-weight:600;
        color:red;
    }

    .btn-insert svg {
        width: 32px; /* Increase size */
        height: 32px;
        fill: #007bff; /* Blue color */
    }

    .btn-insert:hover svg {
        fill: #0056b3; /* Darker blue on hover */
    }
            #tablesChildsSearch{
            font-size:18px;
            padding:3px;
            } 
            #searchInputcrud{
                        font-size:18px;

            }
            
            .navbar {
                display: flex;
            align-items: center;
            justify-content: space-between;
            background-color: #343a40;
            color: white;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 10px;
                }
.navbar .left-buttons{

    text-align:center;

}
    .buttonspageing{
    direction : ltr;
     text-align:center;
    }
     .navbar .left-buttons input {

    text-align:center;
    font-size:18px;

}       .navbar .left-buttons,
            .navbar .right-buttons {
                display: flex;
            align-items: center;

                }

            .navbar .btn {
                border: none;
            cursor: pointer;
            background: none;
            color: white;
            margin: 0 5px;
                }

            .navbar .btn svg {
                width: 24px;
            height: 24px;
                }

            .navbar .btn:hover {
                color: #ffc107;
                }

            .navbar .input-group {
                display: flex;
            align-items: center;
                }

            .navbar input[type="text"],
            .navbar input[type="number"] {
                padding: 5px;
            border: none;
            border-radius: 5px;
            margin: 0 5px;
                }

            .navbar label {
                margin: 0 5px;
                }

                .btn {
        border: none;
        cursor: pointer;
        background: none;
        color: white;
        margin: 0 5px;
        padding: 5px;
        border-radius: 4px;
    }
    .btn-advanced-search {
        background-color: #17a2b8; /* Blue */
    }
    .btn-export-excel {
        background-color: #28a745; /* Green */
    }
    .btn-print {
        background-color: #ffc107; /* Yellow */
    }
    .btn-save {
        background-color: #007bff; /* Primary */
    }
    .btn:hover {
        opacity: 0.8;
    }
        #lastBtn, #nextBtn, #prevBtn, #firstBtn{
        padding:3px;
        margin:0;
        border:solid 1px #ffff
        }
        #lastBtn{
        
        }
        #firstBtn{
        
        }
        .selectalloption{
        border:solid 1px #1a2035;
        }
        #tableSearchInput{
        padding :7px;
        border-radius:15px;
        font-size:18px;
        }
        </style>

        <div class="navbar">
            <div class="left-buttons" >
                 <input list="tablesChildsSearch" id="tableSearchInput" placeholder="${ getCookie("UserLang") =="ar"? "ملفات مرتبطة":"related documents" }">
        <datalist id="tablesChildsSearch">
            <!-- Options will be populated here -->
        </datalist>
                <div class="buttonspageing" >
                       <button class="btn" id="lastBtn" title ="${ getCookie("UserLang") =="ar"? "الأخير":"last" }">
                                    |&lt;
                        </button>
                        <button class="btn" id="nextBtn" title= "${ getCookie("UserLang") =="ar"? "التالي":"next" }">
                                    <<
                        </button>
                        <button class="btn" id="prevBtn" title= "${ getCookie("UserLang") =="ar"? "السابق":"previous" }">
                                    >>
                        </button>
                        <button class="btn" id="firstBtn" title = "${ getCookie("UserLang") =="ar"? "الأول":"first" }">
                                    &gt;|
                        </button>
                         </div>
  <label for="pageNumber">${getCookie("UserLang") =="ar"?"صفحة":"page"}:</label>
                    <input type="number" id="pageNumber" min="1" value="1" style="width: 60px;">
                 <label for="pageNumber">${getCookie("UserLang") =="ar"?"من":"from"}:</label>
                       <label id="pagescount"></label>
                           <div class="input-group">
                         <label for="maxRows">${getCookie("UserLang") =="ar"?"عدد السجلات":"Max rows"}:</label>
                <input type="number" id="maxRows" min="1" data-val="${this.getAttribute("top") ?this.getAttribute("top"): 25 }" value="${this.getAttribute("top") ?this.getAttribute("top"): 25 }" style="width: 60px;">
                <label id="countdata"></label>



                    </div>




                       <input type="text" id="searchInputcrud" placeholder="${getCookie("UserLang") == "ar" ? "البحث السريع ...": "Quick Search..."}" autocomplete="off" >

                            <button class="btn" id="searchBtnadvanced">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
    <path d="M9.5 3C5.36 3 2 6.36 2 10.5S5.36 18 9.5 18c1.47 0 2.84-.47 3.94-1.27l5.96 5.96 1.41-1.41-5.96-5.96c.8-1.1 1.27-2.47 1.27-3.94C17 6.36 13.64 3 9.5 3zm0 2c2.48 0 4.5 2.02 4.5 4.5S11.98 14 9.5 14 5 11.98 5 9.5 7.02 5 9.5 5z" fill="#17a2b8"></path>
</svg>
                            </button>
                    </div>
                    <div class="right-buttons">
                        <button class="btn btn-insert" id="insertBtn" title="${getCookie("UserLang") == "ar" ? "إضافة سجل جديد" : "Insert"}">
    <span style='color:#ffff;font-size:30px;font-weight:600'>+</span>
</button>



                                                 <multi-select checked="checked" name="${this.name}"></multi-select>

    <button class="btn btn-advanced-search" id="uploadFilesdataBtn" title="${getCookie("UserLang") == "ar" ? "رفع بيانات" : "upload file"}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #17a2b8;"><path d="M23 19v2H1v-2h22zM12 7l-8 8h16z"></path></svg>
    </button>
    <button class="btn btn-export-excel" id="exportExcelBtn" title="${getCookie("UserLang") == "ar" ? "تصدير إكسل" : "Export to Excel"}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #28a745;"><path d="M16 1H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h5v2H5v2h14v-2h-4v-2h5c1.1 0 2-.9 2-2V9l-6-8zM4 19V3h11v5h5v11H4z"></path></svg>
    </button>
    <button class="btn btn-print" id="printBtn" title="${getCookie("UserLang") == "ar" ? "طباعة" : "Print"}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #ffc107;"><path d="M19 8H5V3h14v5zm-4 9h-6v-1h6v1zm3-8H6c-1.1 0-2 .9-2 2v7h2v4h12v-4h2v-7c0-1.1-.9-2-2-2zm0 8h-2v2H7v-2H5v-5c0-.55.45-1 1-1h12c.55 0 1 .45 1 1v5z"></path></svg>
    </button>
    <button class="btn btn-save" id="saveBtn" title="${getCookie("UserLang") == "ar" ? "حفظ" : "Save"}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #007bff;"><path d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-2.21 0-4-1.79-4-4 0-2.21 1.79-4 4-4 2.21 0 4 1.79 4 4 0 2.21-1.79 4-4 4zm3-10H6V5h9v4z"></path></svg>
    </button>
</div>
            </div>
            `;

        // Event listeners for the buttons
        this.shadowRoot.getElementById('searchInputcrud').oninput = () => this.search();
        this.shadowRoot.getElementById('searchBtnadvanced').onclick = (e) => this.searchBtnadvancedfun(e);
        this.shadowRoot.getElementById('insertBtn').onclick = () => this.insertData();
        this.shadowRoot.getElementById('firstBtn').onclick = () => this.first();
        this.shadowRoot.getElementById('prevBtn').onclick = () => this.prev();
        this.shadowRoot.getElementById('nextBtn').onclick = () => this.next();
        this.shadowRoot.getElementById('lastBtn').onclick = () => this.last();
        this.shadowRoot.getElementById('uploadFilesdataBtn').onclick = () => this.uploadFilesdata();
        this.shadowRoot.getElementById('exportExcelBtn').onclick = () => this.exportExcel();
        this.shadowRoot.getElementById('printBtn').onclick = () => this.print();
        this.shadowRoot.getElementById('saveBtn').onclick = () => this.save();
       
            // Set default values for pagination inputs
            const maxRowsInput = this.shadowRoot.getElementById('maxRows');
                const pageNumberInput = this.shadowRoot.getElementById('pageNumber');

            pageNumberInput.value = this.getAttribute('page') || 1;

            maxRowsInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        maxRowsInput.setAttribute("data-val", maxRowsInput.value);
        this.updatePagination();
    }
};

                pageNumberInput.onchange = () => {
                    this.updatePagination();
                };

               

    }
   
   
    
    
    searchBtnadvancedfun(e) {
      //  console.log('searchBtnadvancedfun')
        let crudModal = this.shadowRoot.querySelector('crud-modal');

if(crudModal)
{
crudModal.remove();
}


const crudModalString = `<crud-modal name="${this.name}" title="${getCookie("UserLang") == "ar" ? "البحث المتقدم" : "Advanced Search"}"></crud-modal>`;
const wrapper = document.createElement('div');
wrapper.innerHTML = crudModalString;
crudModal = wrapper.firstElementChild;
this.shadowRoot.appendChild(crudModal);
crudModal = this.shadowRoot.querySelector('crud-modal');

const modalBody = crudModal.shadowRoot.querySelector('.modal-body');


        const crudTable = document.querySelector(`crud-table[name="${this.name}"]`);
        const columns = crudTable.info.columns;

        const columnOptions = columns.map(column => `
            <option value="${column.name}" data-type="${column.type}" "${column.referencedTable?`data-reftb="${column.referencedTable}"`:''}">
                ${column.trans_name || column.name}
            </option>
        `).join('');
        

        const conditionOptions = `

            <option value="like">any</option>
            <option value="startwith">begin with</option>
            <option value="between">between</option>
            <option value="endwith">end with</option>
            <option value="=">=</option>
            <option value="<"><</option>
            <option value=">">></option>
            <option value="<="><=</option>
            <option value=">=">>=</option>
            <option value="<>">!=</option>
            <option value="=len">=len</option>
            <option value="<len"><len</option>
            <option value=">len">>len</option>
            <option value="<=len"><=len</option>
            <option value=">=len">>=len</option>
            <option value="in">in</option>

        `;

        const crudModalBodyString = `
                <div class="advanced-search">
                    <h3 id="searchalert" style='color:red;text-align:ceneter'></h3>
                    <button id="clearBtn">clear</button>
                    <button id="addBtn">add</button>
                    <input id="searchInput" list="columnList" placeholder="${getCookie('UserLang') =='ar'?'اختر حقل البحث' : 'Select filed name'}">
                    <datalist id="columnList">${columnOptions}</datalist>
                    <select id="conditionSelect">${conditionOptions}</select>
                     <span id="valueInputContainer">
               <input id="valueInput" class="valueInput" placeholder="${getCookie('UserLang') =='ar'?'ادخل قيمة البحث' : 'Enter search value'}">
              </span>
                    <select id="condTypeSelect">
                        <option value="and">And</option>
                        <option value="or">Or</option>
                    </select>
                    <button id="searchBtn">search</button>
                    <table id="conditionTable">
                        <thead>
                            <tr>
                                <th>Column</th>
                                <th>Condition</th>
                                <th>Value</th>
                                <th>Type</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </crud-modal>
        `;
 
        modalBody.innerHTML =crudModalBodyString

      


       
        crudModal.openModal();
        const saveChangesbtn = crudModal.shadowRoot.querySelector('#saveChanges');
if(saveChangesbtn)
{
    saveChangesbtn.remove();
}
        
        crudModal.shadowRoot.getElementById('addBtn').onclick = () => this.addCondition(crudModal);
        crudModal.shadowRoot.getElementById('searchBtn').onclick = () => this.performSearch(crudModal);
        crudModal.shadowRoot.getElementById('clearBtn').onclick = () => this.clearSearch(crudModal);
        crudModal.shadowRoot.getElementById('valueInput').onkeydown = (e) => this.addConditionvalue(crudModal,e);
        crudModal.shadowRoot.getElementById('searchInput').onchange = (e) => this.changeInputType(crudModal);
        crudModal.shadowRoot.getElementById('conditionSelect').onchange = (e) => this.changeInputType(crudModal);


        
    }
   
    changeInputType(crudModal) {
    
        const condition = crudModal.shadowRoot.getElementById('conditionSelect').value;
    const valueInputContainer = crudModal.shadowRoot.getElementById('valueInputContainer');

    valueInputContainer.innerHTML = ''; // Clear existing inputs

    const createInput = (type) => {
        const input = document.createElement('input');
        input.type = type;
        input.className = 'valueInput';
        return input;
    };

    let valueInput1, valueInput2,valueInput;
    const crudTable = document.querySelector(`crud-table[name="${this.name}"]`);
    const columns = crudTable.info.columns;
    const selectedColumnName =crudModal.shadowRoot.getElementById('searchInput').value;
    const columnObject = columns.find(col => col.name.toLowerCase().trim() === selectedColumnName.trim().toLowerCase() || col.trans_name === selectedColumnName);

    if (!columnObject)
     {
        console.log('not found columnObject')
        return;
    }
    if (!columnObject.type)
     {
        console.log('not found columnObject.type')
        return;
    }
    const columnType = columnObject.type;
    valueInputContainer.innerHTML='';

    if (condition === 'between') {

        valueInput1 = createInputField(columnObject,null);
        valueInput2 = createInputField(columnObject,null);
         valueInput = document.createElement('input');

        valueInput1.oninput = () => {
            if (valueInput1.value > valueInput2.value) {
                valueInput2.value = valueInput1.value;
            }
            valueInput.value = valueInput1.value + ' and ' + valueInput2.value 


        };

        valueInput2.oninput = () => {
            if (valueInput2.value < valueInput1.value) {
                valueInput1.value = valueInput2.value;
            }
            valueInput.value = valueInput1.value + ' and ' + valueInput2.value 
        };
        valueInput1.classList.add('valueInput');
        valueInput2.classList.add('valueInput');
        valueInput.type = 'hidden';
        valueInput.id = 'valueInput';
        valueInputContainer.appendChild(valueInput1);
        valueInputContainer.appendChild(valueInput);
        valueInputContainer.appendChild(valueInput2);
    } else {
        valueInput = createInputField(columnObject,null);
        valueInput.id = "valueInput";

        valueInputContainer.appendChild(valueInput);
    }
}

    clearSearch(crudModal)
    {
        const tbody = crudModal.shadowRoot.getElementById('conditionTable').querySelector('tbody');
        tbody.innerHTML='';

    }
    addConditionvalue(crudModal,e)
    {

        if (e.key === 'Enter') {
        addCondition(crudModal);
        }
    }
    addCondition(crudModal) {
    const searchalert = crudModal.shadowRoot.getElementById('searchalert');
    const searchInput = crudModal.shadowRoot.getElementById('searchInput');
    const conditionSelect = crudModal.shadowRoot.getElementById('conditionSelect');
    const valueInput = crudModal.shadowRoot.getElementById('valueInput');

    const column = searchInput.value;
    const condition = conditionSelect.value;
    const value = valueInput.value;

    const condType = crudModal.shadowRoot.getElementById('condTypeSelect').value;
    searchalert.textContent = '';

   

   
    if (value == null || value == '') {
        searchalert.textContent = getCookie('UserLang') == 'ar' ? 'يجب أضافة قيمة البحث أولا' : 'You must add value to search to get results!';
        setTimeout(() => {
            searchalert.textContent = '';
        }, 3000);
        return;
    }

    const crudTable = document.querySelector(`crud-table[name="${this.name}"]`);
    const columns = crudTable.info.columns;
    const columnObject = columns.find(col => col.name.toLowerCase().trim() === column.trim().toLowerCase() || col.trans_name == column);

    if (columnObject.name == null) {
        searchalert.textContent = getCookie('UserLang') == 'ar' ? 'يجب ختيار حقل البحث أولا' : 'You must add field to search to get results!';
        setTimeout(() => {
            searchalert.textContent = '';
        }, 3000);
        return;
    }

    const tbody = crudModal.shadowRoot.getElementById('conditionTable').querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');

    // Check if the condition already exists
    for (let row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells[0].textContent.trim().toLowerCase() === column.trim().toLowerCase() &&
            cells[1].textContent.trim() === condition &&
            cells[2].textContent.trim() === value &&
            cells[3].textContent.trim() === condType) {
            searchalert.textContent = getCookie('UserLang') == 'ar' ? 'الشرط موجود بالفعل' : 'Condition already exists';
            setTimeout(() => {
                searchalert.textContent = '';
            }, 3000);
            return;
        }
    }

    // If the condition does not exist, add it
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${column}</td>
        <td>${condition}</td>
        <td>${value}</td>
        <td>${condType}</td>
        <td><button class="removeBtn">remove</button></td>
    `;
    tbody.appendChild(row);

    row.querySelector('.removeBtn').onclick = () => {
        tbody.removeChild(row);
    };

    valueInput.value = '';
    searchInput.value = '';
}

    performSearch(crudModal) {
    let tbody = crudModal.shadowRoot.getElementById('conditionTable').querySelector('tbody');
    let rows = tbody.querySelectorAll('tr');
    if (rows.length == 0) {
        this.addCondition(crudModal);
        tbody = crudModal.shadowRoot.getElementById('conditionTable').querySelector('tbody');
        rows = tbody.querySelectorAll('tr');
    }
    if (rows.length == 0) {
        return;
    }
    const crudTable = document.querySelector(`crud-table[name="${this.name}"]`);
    const columns = crudTable.info.columns;

    const conditions = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        const column = columns.find(col => col.name.toLowerCase().trim() === cells[0].textContent.trim().toLowerCase() || col.trans_name == cells[0].textContent);
        const column_name_type = column.ReferencedTable ? 'name' : 'id';
        return {
            column_name: cells[0].textContent,
            cond: cells[1].textContent,
            value: cells[2].textContent,
            cond_type: cells[3].textContent,
            column_name_type: column_name_type
        };
    });

    let name1 = this.name;
    let crudnav = crudTable.shadowRoot.querySelector('crud-navbar');
    let top1 = Number(crudnav.shadowRoot.getElementById('maxRows').getAttribute("data-val")) > 0 ? crudnav.shadowRoot.getElementById('maxRows').getAttribute("data-val") : crudnav.shadowRoot.getElementById('maxRows').value;
    let page1 = crudnav.shadowRoot.getElementById('pageNumber').value;
    let cond1 = JSON.stringify(conditions);
    let cols1 = crudTable.cols;
    crudTable.updateTable(name1, top1, page1, cond1, cols1);
    crudModal.closeModal();
}

    
    getDatatype(columnName) {
        const crudTable = document.querySelector(`crud-table[name="${this.name}"]`);
        const column = crudTable.info.columns.find(col => col.name === columnName);
        return column ? column.type : 'nvarchar(max)';
    }
            getQueryParameter(name) {
                let urlParams = new URLSearchParams(window.location.search);
            return urlParams.get(name);
    }

            updatePagination()
            {
        // Update the pagination based on input values
                let top1 =Number(this.shadowRoot.getElementById('maxRows').getAttribute("data-val") )>0 ?this.shadowRoot.getElementById('maxRows').getAttribute("data-val") : this.shadowRoot.getElementById('maxRows').value;
                let page1 = this.shadowRoot.getElementById('pageNumber').value;
                let name1 = this.getAttribute("name");
              //  let cond1 =  this.getAttribute("cond") ? decodeFromBase64( this.getAttribute("cond")) : null;
              //  let cols1 = this.getAttribute("cols");
                let crudTable = document.querySelector(`crud-table[name="${name1}"]`);

if (crudTable) {
    let cond1 = crudTable.cond;
    let cols1 = crudTable.cols;

    crudTable.updateTable(name1, top1, page1, cond1, cols1);
} else {
    console.error(`No crud-table found with name attribute "${name1}"`);
}
            }

            search() {
                // Function to handle search input
                const query = this.shadowRoot.getElementById('searchInputcrud').value;
            
                document.querySelector(`crud-table[name="${this.name}"]`).filterTable(query);
            }

            first() {
            // Function to handle first button click
            this.shadowRoot.getElementById('pageNumber').value = 1;
            this.updatePagination();
        }


        insertData() {
    let crudModal = this.shadowRoot.querySelector('crud-modal');
    if (!crudModal) {
        const crudModalString = `<crud-modal name="${this.name}" title="${getCookie("UserLang") == "ar" ? "سجل بيانات جديد" : "Add New Record !"}"></crud-modal>`;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = crudModalString;
        crudModal = wrapper.firstElementChild;
        this.shadowRoot.appendChild(crudModal);
    }

    let form = crudModal.shadowRoot.getElementById('editForm');
    if (!form) {
        const modalBody = crudModal.shadowRoot.querySelector('.modal-body');
        form = document.createElement('form');
        form.id = 'editForm';
        modalBody.appendChild(form);
    }

    form.setAttribute('data-id', '');
    form.innerHTML = '';

    const crudTable = document.querySelector(`crud-table[name="${this.name}"]`);
    const columns = crudTable.info.columns;

    const excludedColumns = ['branch_id', 'user_insert', 'begin_date', 'last_update', 'company_id'];

    columns.forEach(column => {
        if (!excludedColumns.includes(column.name.toLowerCase())) {
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = (column.trans_name || column.name) + (column.is_nullable ? '' : ' *');

            let input;

            if (column.ReferencedTable) {
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-control';
                input.setAttribute('data-column', column.name);
                input.dataset.isReferencedTable =1;

                input.setAttribute('data-original-value', '');
                input.setAttribute('data-original-id', null);
                input.required = !column.is_nullable;
                const spanAdd = document.createElement('button');
                spanAdd.style.marginLeft = '5px';
                spanAdd.style.padding = '5px';
                spanAdd.classList.add('btn')
                spanAdd.classList.add('btn-th')
                spanAdd.classList.add('btn-add')
                spanAdd.innerHTML='+';
                spanAdd.onclick = (e) => { e.preventDefault(); crudTable.modalOpenTable(column.ReferencedTable,column.trans_name||column.name)}; // Add onclick event
                formGroup.appendChild(spanAdd);
                formGroup.appendChild(label);
                formGroup.appendChild(input);
                input.onfocus = (e) => {
                   
                const autoCompleteTable = document.createElement('auto-complete-table');

              let   itemObject ={id:null,value:null}
    autoCompleteTable.generateSearch(input, column.ReferencedTable, column,itemObject, (data) => {
        autoCompleteTable.setInput(input, data,column);
    });
    this.shadowRoot.appendChild(autoCompleteTable);

                             };       } else {

                            input=createInputField(column,null)
                             formGroup.appendChild(label);
                                formGroup.appendChild(input);
            }

           
            form.appendChild(formGroup);
        }
    });

    crudModal.openModal();
}


    
prev() {
            // Function to handle previous button click
            if (Number(this.shadowRoot.getElementById('pageNumber').value) == 1)
                return;
            var pageNum = Number(this.shadowRoot.getElementById('pageNumber').value) - 1;

            this.shadowRoot.getElementById('pageNumber').value = pageNum;
            this.updatePagination();

        }

        next() {
            // Function to handle next button click
            let count =     document.querySelector(`crud-table[name="${this.name}"]`).info.count ;
        let top =  document.querySelector(`crud-table[name="${this.name}"]`).info.top ;
        //console.log(top,count);

        let maxpages = Math.ceil( Number(count)/Number(top))

        if(Number(this.shadowRoot.getElementById('pageNumber').value) + 1 >maxpages)
        {
            this.shadowRoot.getElementById('pageNumber').value =maxpages;
        }else{
            var pageNum = Number(this.shadowRoot.getElementById('pageNumber').value) + 1;
            this.shadowRoot.getElementById('pageNumber').value = pageNum;
            this.updatePagination();
        }
           
        }

        last() {
            // Function to handle last button click

        let count =     document.querySelector(`crud-table[name="${this.name}"]`).info.count ;
        let top =  document.querySelector(`crud-table[name="${this.name}"]`).info.top ;
        //console.log(top,count);

        let maxpages = Math.ceil( Number(count)/Number(top))
        this.shadowRoot.getElementById('pageNumber').value = maxpages;
        this.updatePagination();
        }

        uploadFilesdata() {
                // Function to handle advanced search button click
            }

            exportExcel() {
                // Function to handle export to Excel button click
            }

            print() {
                // Function to handle print button click
            }

            save() {
                Swal.fire({
                    title: 'Are you sure?',
                    text: "You want to save changes!",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Yes, save it!'
                }).then((result) => {
                    if (result.isConfirmed) {


                        let dataToSave =[];
                        const crudTable = document.querySelector(`crud-table[name="${this.name}"]`);
                        let saveObj={columns:crudTable.info.columns,data:crudTable.dataMemory,name :this.name}
                         dataToSave.push(  saveObj);
                         //console.log('saveobj'+this.name);
                         loading('saveobj'+this.name);
                        console.log(dataToSave)
                         let savedapiobject = {id: "save",data: JSON.stringify(dataToSave)};
                         $.post('../../API/invoice', savedapiobject, (data) => {
                            unloading('saveobj'+this.name);
                            console.log(data)

                             // Save changes logic
                        Swal.fire(
                            'Saved!',
                            'Your changes have been saved.',
                            'success'
                        );
                         });
                       
                    }
                });
    }
}


class CrudTable extends HTMLElement {
    constructor() {
        super();

      

        this.attachShadow({ mode: 'open' });

        this.name = this.getAttribute('name');
        this.top = this.getAttribute('top') || 25;
        this.page = this.getAttribute('page') || 1;
        if(this.getAttribute('cond') && this.getAttribute('cond') != "")
        {
            this.cond = decodeFromBase64(this.getAttribute('cond')) ;

        }
        this.cols = this.getAttribute('cols');

        const style = `
            <style>
             
        .btn {
        border: none;
        cursor: pointer;
        background: none;
        color: white;
        margin: 0 5px;
        padding: 5px;
        border-radius: 4px;
        transition: transform 0.2s, background-color 0.2s;
    }

    .btn:hover {
        transform: scale(1.2);
        background-color: rgba(0, 123, 255, 0.1);

        font-weight:600;
        color:red;
    }
                #dataContainer_${this.name} {
                    overflow-x: auto;
                    overflow-y: auto;
                    height: 650px;
                    width: 100%;
                    position: relative;
                }

                .loading-spinner {
                    position: absolute;
                    top: 20%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 24px;
                    display: none;
                     z-index: 99999999999999;
                }

                #spinner_${this.name} {
                    border: 8px solid #f3f3f3;
                    border-top: 8px solid #343a40;
                    border-radius: 50%;
                    width: 50px;
                    height: 50px;
                    animation: spin 2s linear infinite;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                #dataContainer_${this.name} table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: auto;
                }

                #dataContainer_${this.name} th,
                #dataContainer_${this.name} td {
                    padding: 4px;
                    border: 1px solid #dee2e6;
                }

                #dataContainer_${this.name} td {
                    white-space: nowrap;
                    max-width: 500px;
                    overflow: auto ;
                }

                #dataContainer_${this.name} th {
                    background-color: #343a40;
                    color: #ffffff;
                    font-weight: bold;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }

                #dataContainer_${this.name} td {
                    background-color: #1a2035;
                    color: #ffffff;
                }

                #dataContainer_${this.name} tr:hover {
                    background-color: #808080;
                }

                /* Hide the first column */
                #dataContainer_${this.name} td:nth-child(2),
                #dataContainer_${this.name} th:nth-child(2) {
                    display: none;
                }
#dataContainer_${this.name} td:nth-child(1),
                #dataContainer_${this.name} th:nth-child(1) {
                    overflow: none;
                }
                .righttable {
                    text-align: right;
                    direction: rtl;
                }

                .righttable td {
                    text-align: right;
                    direction: rtl;
                }

                .btn {
                    border: none;
                    cursor: pointer;
                    background: none;
                    padding: 0;
                    margin: 2px;
                }

                .btn-info svg {
                    fill: #17a2b8;
                }

                .btn-warning svg {
                    fill: #ffc107;
                }

                .btn-danger svg {
                    fill: #dc3545;
                }

                .icon {
                    width: 16px;
                    height: 16px;
                }
                    .editable-input {
                    width: 100%;
                    margin: 0;
                    padding: 0;
                    border: none;
                    background: none;
                    color: #ffffff;
                }
            </style>
        `;

        this.shadowRoot.innerHTML = `
            <crud-navbar name="${this.name}" top="${this.top}" ${ this.cols? `cols="${this.cols}"`:``} ${ this.cond ? `cond="${ encodeToBase64(this.cond) }"`:'' }></crud-navbar>
            <div id="dataContainer_${this.name}"></div>
            <div class="loading-spinner" id="spinner_${this.name}"></div>
            <crud-modal name="${this.name}" title="${getCookie("UserLang") =="ar"? "تعديل بيانات سجل":"Edit Record Data"}"></crud-modal>
            ${style}
        `;

        this.dataMemory = [];
    }

    connectedCallback() {
        this.updateTable(this.name, this.top, this.page, this.cond, this.cols);
    }

    updateTable(name, top, page, cond, cols) {
        const dataContainer = this.shadowRoot.getElementById(`dataContainer_${this.name}`);
        const spinner = this.shadowRoot.getElementById(`spinner_${this.name}`);
        spinner.style.display = 'block';
try
{
    $.post('../../API/invoice?id=get', { name, top, page, cond, cols }, (data) => {
            data = parseJsonValues(data);
           console.log(data);

           if(data.error )
            {

             
                dataContainer.innerHTML =`<h1> Error : ${data.erorr}</h1>`
                spinner.style.display = 'none';

            }else
            {

                if(data.data)
{
    const updatedData = data.data.map(item => {
                const newItem = {};
                for (const key in item) {
                    if (item.hasOwnProperty(key) && key.toLowerCase() !== "company_id") {
                        newItem[key] = item[key];
                    }
                }
                return newItem;
            });

            data.data = updatedData;
            this.dataMemory = data.data;
            this.info = data;
        // //console.log(data);

            this.buildTable(data.data);
            spinner.style.display = 'none';
            
            this.shadowRoot.querySelector('crud-navbar').shadowRoot.getElementById("maxRows").value = data.data.length >0?data.data.length:data.top?data.top:25;
            this.shadowRoot.querySelector('crud-navbar').shadowRoot.getElementById("countdata").innerHTML = (getCookie("UserLang") == "ar" ? ` من (${data.count})` : ` from (${data.count})`);
            this.shadowRoot.querySelector('crud-navbar').shadowRoot.getElementById("pagescount").innerHTML = Math.ceil(Number(data.count) / Number(data.top));
            const tablesChildsSearch = this.shadowRoot.querySelector('crud-navbar').shadowRoot.getElementById('tablesChildsSearch');
            this.info.table_childs.forEach(child => {
                const option = document.createElement('option');
                option.value = child.trans_tb_name || child.tb_name;
                option.setAttribute('data-tbname', child.tb_name);
                tablesChildsSearch.appendChild(option);
            });

            this.shadowRoot.querySelector('crud-navbar').shadowRoot.querySelector('multi-select').populateOptions(data.columns)

}
      else{
        dataContainer.innerHTML =`<h1> Error : No Data </h1>`
        spinner.style.display = 'none';

      }
            }
    
        
     
        });
    
    

}catch(err)
{
    $("#dataCrud").html(`<h1 style='text-align:center;color:red;'>${err} !</h1>`);

}

    
    }

  
    updateSelectedItems(checkbox) {
        const selectedItemsContainer = this.shadowRoot.querySelector('crud-navbar').shadowRoot.getElementById('selectedItems');
        const selectedItem = document.createElement('div');

        const optionDiv = checkbox.parentElement; 
    if (checkbox.checked) {
        optionDiv.classList.add('selected'); 
    } else {
        optionDiv.classList.remove('selected'); 
    }
        selectedItem.classList.add('selected-item');

        
        selectedItem.textContent = checkbox.value;

        if (checkbox.checked) {
            selectedItem.innerHTML += `<span>&times;</span>`;
            selectedItemsContainer.appendChild(selectedItem);

            selectedItem.querySelector('span').onclick = () => {
                checkbox.checked = false;
                selectedItemsContainer.removeChild(selectedItem);
            };
        } else {
            const itemToRemove = Array.from(selectedItemsContainer.children).find(item => item.textContent === checkbox.value + '×');
            if (itemToRemove) {
                selectedItemsContainer.removeChild(itemToRemove);
            }
        }
    }


        filterTable(query) {
            const filteredData = this.dataMemory.filter(item => {
                return Object.values(item).some(value =>
                value?  value.value?String(value.value).toLowerCase().includes(query.toLowerCase()) : String(value).toLowerCase().includes(query.toLowerCase()):false
                );
            });
            this.buildTable(filteredData);
        }

        handleViewButtonClick(item) {
    //console.log("handleViewButtonClick event fired"); // Confirm event firing

    const tableName = this.shadowRoot.querySelector('crud-navbar').shadowRoot.getElementById('tableSearchInput').value;
    const selectedOption = Array.from(this.shadowRoot.querySelector('crud-navbar').shadowRoot.querySelectorAll('#tablesChildsSearch option')).find(option => option.value === tableName);
    if (!selectedOption) {
        Swal.fire('Error', 'Please select a valid table.', 'error');
        return;
    }

    const tbName = selectedOption.getAttribute('data-tbname');
    const findedObj = this.info.table_childs.find(obj => obj.tb_name === tbName);
    
    if (!findedObj) {
        Swal.fire('Error', 'Table not found.', 'error');
        return;
    }

    const cond = [{ column_name: findedObj.column_name, value: item.ID }];

    this.modalOpenTable(findedObj.tb_name,findedObj.trans_tb_name,cond)

}

modalOpenTable(tb_name,trans_tb_name,cond)
{

    const modal = document.createElement('div');

modal.classList.add('modal');
const modalsytle = document.createElement('style');
modalsytle.innerHTML=`   .modal {
                    display: none;
                    position: fixed;
                    z-index: 9999999;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    overflow: auto;
                    justify-content: center;
                    align-items: center;
                      background-color: #1a2035;
                    color: white;
                }

                .modal-content {
                    margin: auto;
                    padding: 20px;
                    border: 1px solid #888;
                    width: 90%;

                    border-radius: 10px;
                    box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2);
                    animation-name: animatetop;
                    animation-duration: 0.4s;
                    font-family: Arial, sans-serif;
                    background-color: #1a2035;
                    color: white;
                }

                @keyframes animatetop {
                    from { top: -300px; opacity: 0 }
                    to { top: 0; opacity: 1 }
                }

                .modal-header {
                    padding: 2px 16px;
                    background-color: #1a2035;
                    color: white;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top-left-radius: 10px;
                    border-top-right-radius: 10px;
                }

                .modal-body {
                    padding: 2px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .modal-footer {
                    padding: 2px 16px;
                    background-color: #1a2035;
                    color: white;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    border-bottom-left-radius: 10px;
                    border-bottom-right-radius: 10px;
                }

                .close {
                     background-color: #1a2035;
                    color: white;
                    float: right;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                }

                .close:hover,
                .close:focus {
                     background-color: white ;
                    color: #1a2035;
                    text-decoration: none;
                    cursor: pointer;
                }
`;
modal.appendChild(modalsytle)

modal.style.zIndex = getMaxZindex();
const modalContent = document.createElement('div');
modalContent.classList.add('modal-content');

const modalHeader = document.createElement('div');
modalHeader.classList.add('modal-header');
modalHeader.innerHTML = `
    <h2>${getCookie("UserLang") =="ar"? "عرض بيانات":"View data"}  ${trans_tb_name||tb_name}</h2>
    <span class="close" id="closeBtn">&times;</span>
`;

const modalBody = document.createElement('div');
modalBody.classList.add('modal-body');
modalBody.innerHTML=`<crud-table  name="${tb_name}"   "${cond?` cond="${ encodeToBase64(JSON.stringify(cond))   }"`:""}" ></crud-table>`



const modalFooter = document.createElement('div');
modalFooter.classList.add('modal-footer');
const closeButton = document.createElement('button');
closeButton.textContent = 'Close';
closeButton.classList.add('btn', 'btn-secondary');
closeButton.onclick = () => {
    modal.style.display = 'none';
    document.body.removeChild(modal);
};

modalFooter.appendChild(closeButton);

modalContent.appendChild(modalHeader);
modalContent.appendChild(modalBody);
modalContent.appendChild(modalFooter);
modal.appendChild(modalContent);

document.body.appendChild(modal);
modal.style.display = 'flex';

document.getElementById('closeBtn').onclick = () => {
    modal.style.display = 'none';
    document.body.removeChild(modal);
};
}


    buildTable(data) {

        if(!data[0])
    {
        return
    }
            const container = this.shadowRoot.getElementById(`dataContainer_${this.name}`);

            const table = document.createElement('table');
            const thead = document.createElement('thead');
            const tbody = document.createElement('tbody');

            // Generate table headers based on keys of the first object
            const headers = Object.keys(data[0]);
            const headerRow = document.createElement('tr');



            // Add CRUD column header
            const crudTh = document.createElement('th');
            crudTh.textContent = "Actions";
            crudTh.isnotedit=true;
            // Create the edit button and append it to the crudTh
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path d="M3 17.25V21h3.75l11.01-11.01-3.75-3.75L3 17.25zM21 7.24c0-.39-.15-.76-.44-1.06l-2.34-2.34a1.492 1.492 0 0 0-2.12 0l-1.83 1.83 3.75 3.75 1.83-1.83c.3-.3.45-.67.45-1.06z"></path></svg>';
    editBtn.className = 'btn btn-warning btn-sm';
    editBtn.onclick = () => this.toggleEditableHeaders();
    
    crudTh.appendChild(editBtn);
    headerRow.appendChild(crudTh);
            headers.forEach(header => {
            
                const th = document.createElement('th');
                let columnObject = this.info.columns.find(obj => obj.name.toLowerCase() === header.toLowerCase());
                //console.log(columnObject)
                  th.setAttribute('data-colname', header); // Add data-colname attribute
                  let tranname = columnObject ? (columnObject.trans_name || header) : header;
                 th.setAttribute('data-transname', tranname); // Add data-colname attribute
                 //console.log(columnObject)
                 if(columnObject.ReferencedTable)
                 {
                    th.setAttribute('data-reftable',columnObject.ReferencedTable)
                 }
                this.addThdata(th); 
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Generate table rows
            data.forEach(item => {
                const row = document.createElement('tr');
                row.setAttribute('data-id', item.ID);

                // Add CRUD buttons
                const crudTd = document.createElement('td');
                const viewBtn = document.createElement('button');
                const editBtn = document.createElement('button');
                const deleteBtn = document.createElement('button');

                viewBtn.className = "btn btn-info btn-sm";
                viewBtn.innerHTML = `
 <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 32px; height: 32px;">
            <path d="M12 4.5c-4.69 0-8.5 3.61-8.5 8s3.81 8 8.5 8 8.5-3.61 8.5-8-3.81-8-8.5-8zm0 14.5c-3.59 0-6.5-2.91-6.5-6.5s2.91-6.5 6.5-6.5 6.5 2.91 6.5 6.5-2.91 6.5-6.5 6.5zm1-6.5h-2v-5h2v5zm0 2h-2v-2h2v2z"></path>
        </svg>`;
viewBtn.onclick = () => this.handleViewButtonClick(item);


                editBtn.className = "btn btn-warning btn-sm";
                editBtn.innerHTML = `
<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 32px; height: 32px;">
            <path d="M3 17.25V21h3.75l11.01-11.01-3.75-3.75L3 17.25zM21 7.24c0-.39-.15-.76-.44-1.06l-2.34-2.34a1.492 1.492 0 0 0-2.12 0l-1.83 1.83 3.75 3.75 1.83-1.83c.3-.3.45-.67.45-1.06z"></path>
        </svg>`;
                editBtn.onclick = () => this.editData(item);

                deleteBtn.className = "btn btn-danger btn-sm";
                deleteBtn.innerHTML = `
<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 32px; height: 32px;">
    <path d="M5 3h14c1.1 0 2 .9 2 2H3c0-1.1.9-2 2-2zm2 3v13c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V6H7zm2-3h6v2h-6V3zm6 0h-6v2h6V3z"/>

        </svg>`;
                deleteBtn.onclick = () => this.deleteData(item.ID);

                crudTd.appendChild(viewBtn);
                crudTd.appendChild(editBtn);
                crudTd.appendChild(deleteBtn);
                row.appendChild(crudTd);

                headers.forEach(header => {
                    const td = document.createElement('td');
                    let value = item[header];

                    if (typeof value === 'object' && value !== null && value.value) {
                        td.textContent = value.value;
                    }  else {
                        value= value !== null ? value : '';
                        value = (typeof value === 'string') ? value.replace('T00:00:00', '') : value;
                        td.textContent = value;
                    }

                    if (header.toLowerCase() !== "branch_id" && header.toLowerCase() !== "user_insert" && header.toLowerCase() !== "begin_date"  ) {


                        td.setAttribute('contenteditable', true); 
                         
                         this.tdConvertText(td,header,value);

                         const eventHandler = (e) => 
                         {

                            this.clearalldivstd();
         e.target.style.backgroundColor = '#fff'; // Highlight cell on focus
         e.target.style.color = '#000'; // Highlight cell on focus
         e.target.style.whiteSpace = 'pre-wrap'
         const columnObject = this.info.columns.find(obj => obj.name.toLowerCase() === header.toLowerCase());

if (columnObject && columnObject.ReferencedTable) 
{
 if(item[header] == null)
{

 item[header] = {id:null,value:''};
}

if (e.target.dataset.handled == '1')
 {
        
    }else
    {
        e.target.dataset.handled = '1';
        
        this.handleAutocomplete(td, columnObject, header, item[header]);
    }

   
} 


this.tdbuildfile(td,header,item[header],item);




                 };


                 td.addEventListener('click', eventHandler);
                 td.addEventListener('focus', eventHandler);

                 td.onblur = (e) => {
                    e.target.dataset.handled = '0';
                this.clearalldivstd();
         let  newValue = ''

if(e.target.querySelector('input'))
{
    newValue=e.target.querySelector('input').value?e.target.querySelector('input').value:'';

}else
{
    newValue = e.target.textContent.trim();

}
        

         
         if (header !== 'ID')
          {
             // Update the item in memory
             if (typeof item[header] === 'object' && item[header] !== null) {
             
                // item[header].value = newValue;
             } 
             else {

                 
                 item[header] = newValue;
             }
         }
         e.target.style.backgroundColor = ''; // Remove highlight on blur
         e.target.style.color = ''; // Highlight cell on focus
         e.target.style.whiteSpace ='';
         this.tdConvertText(e.target,header,newValue);
         
     };

 

    }

                    row.appendChild(td);
                });
              //  row.onmouseover = () => this.makeRowEditable(row, item, headers);
             //   row.onmouseout = () => this.makeRowNonEditable(row, item, headers);
                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            if (getCookie("UserLang") == "ar") {
                container.classList.add("righttable");
            }
            container.innerHTML = ''; // Clear any existing content
            container.appendChild(table);
        }

     
        toggleEditableHeaders() {
    const thElements = this.shadowRoot.querySelectorAll('th');
    const isEditable = Array.from(thElements).some(th => th.isContentEditable);

    thElements.forEach(th => {

        if(th.isnotedit)
    {
        return;
    }
        if (!isEditable) {
            th.contentEditable = true;
            th.style.backgroundColor = '#fff';
            th.style.color = '#000';
            th.textContent = th.getAttribute("data-transname");
            th.addEventListener('focus', (event) => this.thfocus(event));
            th.addEventListener('blur', (event) => this.saveTranslatedText(event));
        } else {
            th.contentEditable = false;
            th.style.backgroundColor = '';
            th.style.color = '';
            th.removeEventListener('focus', this.thfocus);
            th.removeEventListener('blur', this.saveTranslatedText);
            this.addThdata(th);


        }
    });
}
tdConvertText(td,header,value)
{
    if(header.toLowerCase().indexOf('image') >-1 ||  header.toLowerCase().indexOf('img') >-1 || header.toLowerCase().indexOf('photo') >-1 || header.toLowerCase().indexOf('attached') >-1 )
                    {


                        td.classList.add('phototd');
                        td.setAttribute('contenteditable',false);
                    }else if(header.toLowerCase().indexOf('url') >-1 || header.toLowerCase().indexOf('link') >-1)
                    {
                        td.classList.add('linktd');
                        td.classList.add('divtd');
                        td.setAttribute("data-colname",header);

                        td.setAttribute('contenteditable',false);


                    }
    if(value == null || value =="")
    {

        return;
    }
    if(!header)
    {
        return; 
    }
    if(!td)
    {
        return; 
    }
     if(header.toLowerCase().indexOf('image') >-1 || header.toLowerCase().indexOf('img') >-1 || header.toLowerCase().indexOf('photo') >-1 || header.toLowerCase().indexOf('attached') >-1 )
                    {
                        if(value)
                    {
                        let tdhtml = value;
                        if(value.toLowerCase().indexOf(".pdf")>-1)
                    {
                      
                        let aElement = document.createElement('a');
aElement.className = 'removeelm';
aElement.href = value;
aElement.target = '_blank';
aElement.onclick = (e) => {e.stopPropagation();}

let iconElement = document.createElement('i');
iconElement.className = 'ace-icon fa fa-file-photo-o bigger-230';
iconElement.onclick = (e) => {e.stopPropagation();}

let iframeElement = document.createElement('iframe');
iframeElement.className = 'removeelm';
iframeElement.src = value;
iframeElement.title = 'file upload';
iframeElement.style.width = '150px';
iframeElement.style.height = 'auto';
iframeElement.onload = function() {
    this.width = screen.width;
};
iframeElement.onclick = (e) => {e.stopPropagation();}


aElement.appendChild(iconElement);

td.appendChild(aElement);
td.appendChild(iframeElement);

                    }else
                    {
                    
                    
                        let aElement = document.createElement('a');
aElement.className = 'removeelm';
aElement.href = value;
aElement.target = '_blank';
aElement.onclick = (e) => {e.stopPropagation(); 
    //e.preventDefault(); 
//let href = 

}
aElement.style.cursor='pointer';
aElement.padding ='5px;'
let imgElement = document.createElement('img');
imgElement.className = 'removeelm';
imgElement.src = value;
imgElement.style.width = '150px';
imgElement.style.height = 'auto';
imgElement.style.maxHeight = '500px';
imgElement.onclick = (e) => {
    e.stopPropagation();
    //e.preventDefault();
}
td.innerHTML ='';
aElement.appendChild(imgElement)
td.appendChild(aElement);


                    }

                       
                    }
                    
                
                }
                

                 if(header.toLowerCase().indexOf('url') >-1 || header.toLowerCase().indexOf('link') >-1)
                        {

                            
let aLink = document.createElement('a');
aLink.setAttribute("targer","blank");
aLink.setAttribute("href",value);
aLink.classList.add("removeelm");
aLink.textContent ="Link";
aLink.onclick = (e) => {e.stopPropagation();}
td.appendChild(aLink) 




                        }
}

clearalldivstd()
{
   let divstds = this.shadowRoot.querySelectorAll('.divtd')

   divstds.forEach(td=>{
    let tr = td.parentElement;
        while (tr && tr.tagName !== 'TR') {
            tr = tr.parentElement;
        }

        let id = tr.dataset.id;
        console.log(id);
    const curitem = this.dataMemory.find(item => item.ID === id);
    console.log(curitem);
let header = td.getAttribute("data-colname");

    let imageval = "";
let imgeelm =   td.querySelector(".mastervalue");

if(imgeelm)
{
imageval = imageval.value? imageval.value:'';
}



console.log(imageval)
console.log(curitem[header])


td.style.backgroundColor = ''; // Remove highlight on blur
td.style.color = ''; // Highlight cell on focus
td.style.whiteSpace ='';
td.innerHTML=curitem[header]?curitem[header]:'';
this.tdConvertText(td,header,td.innerHTML,curitem);

   });
   



}
tdbuildfile(td,header,value,item)
{
    if(!header)
{
    return;
}
if(header.toLowerCase().indexOf('image') >-1  ||header.toLowerCase().indexOf('img') >-1 || header.toLowerCase().indexOf('photo') >-1 || header.toLowerCase().indexOf('attached') >-1 )
{

    td.classList.add('phototd');
    td.classList.add('divtd');
    td.setAttribute("data-colname",header);

let inputtext = document.createElement('input');
inputtext.classList.add('mastervalue') ;
inputtext.classList.add('removeelm') ;
inputtext.oninput = (e) => {
    
    console.log(item)
console.log(item[header]);
console.log(e.target.value?e.target.value:'');
    item[header] = e.target.value?e.target.value:'';
    console.log(item[header]);

}

inputtext.value =value;
inputtext.onclick = (e) => {e.stopPropagation();}

let inputfiles = document.createElement('input');
inputfiles.setAttribute("type","file");
inputfiles.classList.add('imagefile') ;
inputfiles.classList.add('removeelm') ;
inputfiles.onclick = (e) => {e.stopPropagation();}

let imgfile = document.createElement('img');
imgfile.classList.add("imagesrc");
inputfiles.classList.add('removeelm') ;
imgfile.style.maxWidth ="150px;";
imgfile.style.height ="auto"; 
imgfile.onclick = (e) => {
    e.stopPropagation();
}
imgfile.onchange = (e) => {
    console.log("upload photo")
    savephoto($(this).closest('td').find('.mastervalue'),this,$(this).closest('td').find('.imagesrc'))
}
let spanclose = document.createElement('span');
spanclose.classList.add('removeelm') ;
spanclose.textContent ="X";
spanclose.style.padding ="5px;"
spanclose.onclick = (e) => {e.stopPropagation();

    this.clearalldivstd()

}



td.innerHTML='';
td.appendChild(spanclose);

td.appendChild(inputtext);
td.appendChild(inputfiles);
td.appendChild(imgfile);




}
   

}


thfocus(event)
{
    const th = event.target;

    th.getAttribute('data-transname')

th.textContent = th.getAttribute('data-transname');
}
saveTranslatedText(event) {
    const th = event.target;

    let oldval = th.getAttribute('data-transname').trim();

                   
    const translatedText = th.textContent.trim();
    const word = th.dataset.colname;
    const objecttype = this.name;
    const langto = getCookie('UserLang');
    const langfrom = 'en';
    const compid = getCookie("CompId")
    if (langto !== langfrom && translatedText !== word && oldval != translatedText ) {
        $.post('../../API/invoice?id=proc', {
            name: "trans_fix_all",
            parms: [word, objecttype, langfrom, langto, translatedText,compid]
        }, (data) => {
            console.log(data);
            if(Number(data)>0)
        {
            th.setAttribute('data-transname',translatedText);
           // this.addThdata(th);       
        }
        });
    }else
    {
      
      //  this.addThdata(th);       
    }


}

addThdata(th)
{
             let coltext = th.getAttribute('data-transname').trim();

                const spanSort = document.createElement('span');
                spanSort.style.marginLeft = '5px';
                spanSort.style.padding = '5px';

                spanSort.classList.add('btn')
                spanSort.classList.add('btn-th')
                spanSort.classList.add('btn-sort')
                console.log(spanSort.innerHTML);
                if(spanSort.innerHTML=='' ||  spanSort.innerHTML == null)
                {
                    spanSort.innerHTML='>';

                }
                spanSort.onclick = (e) => this.sortTable(th.getAttribute('data-colname'),spanSort,e); 
                th.innerHTML='';
                th.appendChild(spanSort);
                if(th.getAttribute('data-reftable')) 
                {
                 const spanAdd = document.createElement('span');
                spanAdd.style.marginLeft = '5px';
                spanAdd.style.padding = '5px';
                spanAdd.classList.add('btn')
                spanAdd.classList.add('btn-th')
                spanAdd.classList.add('btn-add')
                spanAdd.innerHTML='+';
                spanAdd.onclick = () => this.modalOpenTable(th.getAttribute('data-reftable'),coltext); // Add onclick event
                th.appendChild(spanAdd);
                }
                const spanname = document.createElement('span');
                spanname.textContent = coltext;

                th.appendChild(spanname);
                 

}
handleAutocomplete(td, columnObject, columnName, itemObject) {
    td.dataset.column = columnName;
    const referencedTableName = columnObject.ReferencedTable;
    const query = td.textContent.trim();
    const autoCompleteTable = document.createElement('auto-complete-table');
    autoCompleteTable.generateSearch(td,referencedTableName, columnObject,itemObject, (data) => {
        autoCompleteTable.setInput(td, data,columnObject);

    });
    this.shadowRoot.appendChild(autoCompleteTable);
}

sortTable(column,span,e) {
            const isAscending = this.isAscending || false;
            this.dataMemory.sort((a, b) => {
                const valueA = a[column] !== null ? (a[column].value ? a[column].value : a[column]) : '';
                const valueB = b[column] !== null ? (b[column].value ? b[column].value : b[column]) : '';

                if (valueA > valueB) {
                    return isAscending ? 1 : -1;
                } else if (valueA < valueB) {
                    return isAscending ? -1 : 1;
                } else {
                    return 0;
                }
            });
            this.isAscending = !isAscending; // Toggle the sorting order for next click

// Update the span icon
//console.log(isAscending);
//console.log(span)
if (isAscending) {
    e.target.innerHTML = '&#9650;'; // Up arrow
} else {
    e.target.innerHTML = '&#9660;'; // Down arrow
}

            this.buildTable(this.dataMemory); // Rebuild table with sorted data
        }



        viewData(item) {
            // Implement view functionality if needed
        }

        editData(item) {
    let crudModal = this.shadowRoot.querySelector('crud-modal');
    if (!crudModal) {
        const crudModalString = `<crud-modal name="${this.name}" title="${getCookie("UserLang") == "ar" ? "تعديل بيانات سجل" : "Edit Record Data"}"></crud-modal>`;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = crudModalString;
        crudModal = wrapper.firstElementChild;
        this.shadowRoot.appendChild(crudModal);
    }

    let form = crudModal.shadowRoot.getElementById('editForm');
    if (!form) {
        const modalBody = crudModal.shadowRoot.querySelector('.modal-body');
        form = document.createElement('form');
        form.id = 'editForm';
        modalBody.appendChild(form);
    }

    form.setAttribute('data-id', item.ID);
    form.innerHTML = '';

    const crudTable = document.querySelector(`crud-table[name="${this.name}"]`);
    const columns = crudTable.info.columns;

    const excludedColumns = ['branch_id', 'user_insert', 'begin_date', 'last_update', 'company_id'];

    columns.forEach(column => {
        if (!excludedColumns.includes(column.name.toLowerCase())) {
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = (column.trans_name || column.name) + (column.is_nullable ? '' : ' *');

            let input;

            if (column.ReferencedTable) {
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-control';
                //input.setAttribute('list', `datalist_${column.name}`);

                input.dataset.isReferencedTable =1
                input.setAttribute('data-column', column.name);
                input.setAttribute('data-original-value', item[column.name] ? item[column.name].value : '');
                input.setAttribute('data-original-id', item[column.name] ? item[column.name].id : null);
                input.value = item[column.name] ? item[column.name].value : '';
                input.required = !column.is_nullable;
                input.setAttribute('data-id', item[column.name] ? item[column.name].id : '');
                input.setAttribute('data-val', item[column.name] ? item[column.name].value : '');
                const spanAdd = document.createElement('button');
                spanAdd.style.marginLeft = '5px';
                spanAdd.style.padding = '5px';
                spanAdd.classList.add('btn')
                spanAdd.classList.add('btn-th')
                spanAdd.classList.add('btn-add')
                spanAdd.innerHTML='+';
                spanAdd.onclick = (e) => { e.preventDefault(); this.modalOpenTable(column.ReferencedTable,column.trans_name||column.name)}; // Add onclick event
                formGroup.appendChild(spanAdd);
                formGroup.appendChild(label);
                formGroup.appendChild(input);

                //console.log(item[column.name]);

                let itemObject ;

                if(item[column.name])
            {
                itemObject ={id:item[column.name].id,value : item[column.name].value}
            }
            input.onfocus = (e) => {
    const autoCompleteTable = document.createElement('auto-complete-table');
    autoCompleteTable.generateSearch(input,column.ReferencedTable, column,itemObject, (data) => {
        autoCompleteTable.setInput(input, data,column);
    });
    this.shadowRoot.appendChild(autoCompleteTable);
};

        } else
             {

                input=createInputField(column,item)
                formGroup.appendChild(label);
                formGroup.appendChild(input);
            }

            
            form.appendChild(formGroup);
        }
    });

    crudModal.openModal();
}
  
    
    
    deleteData(id) {
            Swal.fire({
                title: 'Are you sure?',
                text: "You won't be able to revert this!",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Yes, delete it!'
            }).then((result) => {
                if (result.isConfirmed) {
                    $.post(`../../API/invoice?id=delete&rowid=${id}`, function (response) {
                        Swal.fire(
                            'Deleted!',
                            'Your record has been deleted.',
                            'success'
                        ).then(() => {
                            // Reload data after deletion
                            location.reload();
                        });
                    });
                }
            });
        }
    }

class CrudModal extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        if(this.getAttribute("title"))
    {
        this.title =this.getAttribute("title");
    }
       if( this.title == null)
       {
        this.title = getCookie("UserLang") =="ar" ?"سجل بيانات" :"Data Record"
       }
       if(this.name == null && this.getAttribute("name") != null)
       {
        this.name =this.getAttribute("name");

       }
        this.shadowRoot.innerHTML = `
<style>
                .modal {
    display: none; /* Hidden by default */
    position: fixed; /* Stay in place */
    z-index: 9999; /* Sit on top */
    left: 0;
    top: 0;
    width: 100%; /* Full width */
    height: 100%; /* Full height */
    overflow: auto; /* Enable scroll if needed */
    background-color: rgb(0,0,0); /* Fallback color */
    background-color: rgba(0,0,0,0.4); /* #1a2035 w/ opacity */
    justify-content: center; /* Center the modal */
    align-items: center; /* Center the modal */
}

                .modal-content {
                    background-color: #fefefe;
                    color:#000;
                    margin: auto;
                    padding: 20px;
                    border: 1px solid #888;
                    width: 80%;
                    max-width: 1000px; /* Maximum width */
                    border-radius: 10px; /* Rounded corners */
                    box-shadow: 0 4px 8px 0 rgba(0,0,0,0.2);
                    animation-name: animatetop;
                    animation-duration: 0.4s;
                    font-family: Arial, sans-serif;
                }

                @keyframes animatetop {
                    from {top: -300px; opacity: 0}
                    to {top: 0; opacity: 1}
                }

                .modal-header {
                    padding: 2px 16px;
                    background-color: #5cb85c;
                    color: white;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top-left-radius: 10px;
                    border-top-right-radius: 10px;
                }

                .modal-body {
                    padding: 2px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .modal-footer {
                    padding: 2px 16px;
                    background-color: #5cb85c;
                    color: white;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    border-bottom-left-radius: 10px;
                    border-bottom-right-radius: 10px;
                }

                .close {
                    color: white;
                    float: right;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                }

                .close:hover,
                .close:focus {
                    color: #000;
                    text-decoration: none;
                    cursor: pointer;
                }

                .form-group {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                }

                .form-group label {
                    flex: 1;
                    margin-right: 10px;
                    font-weight: bold;
                }

                .form-group input {
                    flex: 2;
                    padding: 5px;
                    font-size: 18px;
                }
.form-group textarea {
                    flex: 2;
                    padding: 5px;
                    font-size: 18px;
                     overflow: auto;
                
                }
                .btn {
                    padding: 10px 20px;
                    background-color: #5cb85c;
                    color: white;
                    border: none;
                    cursor: pointer;
                    border-radius: 5px;
                    font-size: 16px;
                }

                .btn-secondary {
                    background-color: #d9534f;
                }

                .btn:hover {
                    opacity: 0.8;
                }
</style>

<div id="editModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2>${this.title}</h2>
            <span class="close" id="closeBtn">&times;</span>
        </div>
        <div class="modal-body">
            <form id="editForm"></form>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="closeFooterBtn">${getCookie("UserLang") =="ar" ? "غلق":"closr"}</button>
            <button type="button" class="btn btn-primary" id="saveChanges">${getCookie("UserLang") =="ar" ? "حفظ البيانات":"Save Data"}</button>
        </div>
    </div>
</div>
        `;

        // Event listeners for closing the modal
        this.shadowRoot.getElementById('closeBtn').onclick = () => this.closeModal();
        this.shadowRoot.getElementById('closeFooterBtn').onclick = () => this.closeModal();
        this.shadowRoot.getElementById('saveChanges').onclick = () => this.saveInsert();

    }

    openModal() {
        this.shadowRoot.getElementById('editModal').style.display = 'flex';
    }

    closeModal() {
       // this.shadowRoot.getElementById('editModal').style.display = 'none';
     //  this.shadowRoot.querySelector('crud-modal').remove();
     this.remove();
    }





    saveInsert() {
    const form = this.shadowRoot.getElementById('editForm');
    const requiredFields = Array.from(form.querySelectorAll('input[required]'));
    let isValid = true;

    requiredFields.forEach(input => {
        if (input.type !== 'checkbox' && !input.value.trim()) {
            isValid = false;
            alert(`Please fill out the required field: ${input.previousSibling.textContent}`);
        } else if (input.dataset.isReferencedTable == 1 && (input.getAttribute('data-id') == null || input.getAttribute('data-id') == '')) {
            isValid = false;
            alert(`Please fill out the required field: ${input.previousSibling.textContent}`);
        }
    });

    if (!isValid) {
        return;
    }

    Swal.fire({
        title: 'Are you sure?',
        text: "You want to save changes!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, save it!'
    }).then((result) => {
        if (result.isConfirmed) {
            const newData = {};
            let id = null;

            Array.from(form.querySelectorAll('input')).forEach(input => {
                const column = input.getAttribute('data-column');
                if (column.toLowerCase() === 'id') {
                    id = input.value;
                }

                if (input.list) {
                    const datalist = input.list;
                    const selectedOption = Array.from(datalist.options).find(option => option.value === input.value);
                    if (selectedOption) {
                        newData[column] = {
                            id: selectedOption.dataset.id,
                            value: input.value
                        };
                    } else {
                        const originalValue = input.dataset.originalValue || '';
                        const originalId = input.dataset.originalId || null;
                        if (originalValue == '' || originalId == "null" || originalId == null || originalId == '') {
                            newData[column] = null;
                            input.value = '';
                        } else {
                            newData[column] = { id: originalId, value: originalValue };
                            input.value = originalValue;
                            input.setAttribute('data-id', originalId);
                        }
                    }
                } else {
                    let idval;

                    try {
                        idval = input.getAttribute("data-id");
                    } catch (err) {
                        //console.log(err);
                    }
                    //console.log("idval", idval);
                    if (idval) {
                        newData[column] = { id: input.dataset.id, value: input.dataset.val };
                    } else {
                        if (input.type === 'number') {
                            newData[column] = input.value !== "" && Number(input.value) >= 0 ? Number(input.value) : null;
                        } else if (input.type === 'checkbox') {
                            newData[column] = input.checked ? 1 : 0;
                        } else {
                            newData[column] = input.value && input.value !== "" ? input.value : null;
                        }
                    }
                }
            });

            console.log(newData); // Print the new data object to the console
            let newdataArr = [];
            newdataArr.push(newData);

            let dataToSave = [];
            const crudTable = document.querySelector(`crud-table[name="${this.name}"]`);
            let saveObj = { columns: crudTable.info.columns, data: newdataArr, name: this.name };
            dataToSave.push(saveObj);

            loading('saveobj' + this.name);

            let savedapiobject = { id: "save", data: JSON.stringify(dataToSave) };
            $.post('../../API/invoice', savedapiobject, (data) => {
                unloading('saveobj' + this.name);
                console.log(data);

                const crudTable = document.querySelector(`crud-table[name="${this.getAttribute('name')}"]`);
                const existingItemIndex = crudTable.dataMemory.findIndex(item => item.ID === id);

                if (existingItemIndex !== -1) {
                    crudTable.dataMemory[existingItemIndex] = newData;
                } else {
                    crudTable.dataMemory.unshift(newData); // Add new data at the beginning
                }

                crudTable.buildTable(crudTable.dataMemory);

                this.closeModal();

                Swal.fire(
                    'Saved!',
                    'Your changes have been saved.',
                    'success'
                );
            });
        }
    });
}

}



customElements.define('auto-complete-table', AutoCompleteTable);
customElements.define('multi-select', MultiSelect);
customElements.define('crud-navbar', CrudNavBar);
customElements.define('crud-modal', CrudModal);
customElements.define('crud-table', CrudTable);



 function parseJsonValues(obj) {
        // Iterate over each property in the object
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                try {
                    // Attempt to parse the value as JSON
                    let parsedValue = JSON.parse(obj[key]);

                    // If successful, replace the original value with the parsed JSON object
                    obj[key] = parsedValue;
                } catch (e) {
                    // If parsing fails, the value is not a JSON string, so leave it as is
                }

                // Recursively parse nested objects
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    parseJsonValues(obj[key]);
                }
            }
        }
        return obj;
    }

 function encodeToBase64(str) {
    const utf8Bytes = new TextEncoder().encode(str); // Convert string to UTF-8 bytes
    const base64String = btoa(String.fromCharCode.apply(null, utf8Bytes)); // Convert bytes to Base64
    return base64String;
}

function decodeFromBase64(base64Str) {
    const binaryString = atob(base64Str); // Convert Base64 to binary string
    const utf8Bytes = Uint8Array.from(binaryString, char => char.charCodeAt(0)); // Convert binary string to bytes
    const decodedString = new TextDecoder().decode(utf8Bytes); // Decode bytes to UTF-8 string
    return decodedString;
}
function generateUniqueID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getTodayDate(type) {
    const today = new Date();
    if (type === 'date') {
        return today.toISOString().split('T')[0];
    } else if (type === 'datetime-local') {
        return today.toISOString().slice(0, 16);
    }
    return '';
}

function getInputTypeForSQLType(type, length) {
    // For SQL types, you can add more cases as needed
    switch (type.toLowerCase()) {
        case 'varchar':
        case 'nvarchar':
        case 'text':
        case 'ntext':
            if (length > 150) {
                return 'textarea';
            }
            return 'text';
        case 'int':
        case 'smallint':
        case 'bigint':
            return 'number';
        case 'bit':
            return 'checkbox';
        case 'datetime':
        case 'smalldatetime':
        case 'date':
            return 'date';
        default:
            return 'text';
    }
}

function createInputField(column, item) {
    const inputType = getInputTypeForSQLType(column.type.split('(')[0], column.length);
    if(column.length>60)
{
    //console.log('texterea1');
}
    let input;
    if (inputType === 'textarea') {
        input = document.createElement('textarea');
    } else {
        input = document.createElement('input');
        input.type = inputType;
    }
    
    input.className = 'form-control';
    input.setAttribute('data-column', column.name);
    input.required = !column.is_nullable;

    if (inputType === 'date' || inputType === 'datetime-local') {
        if(item)
    {
        input.value = item[column.name] || getTodayDate(inputType);
    }else
    {
        input.value = getTodayDate(inputType);
    }
        
    } else {
        if(item)
        {
            input.value = item[column.name] ? item[column.name].value || item[column.name] : '';
        }
        
    }
    if (column.name.toLowerCase() === "id")
     {
                   
                   
                    input.readOnly = true;

                    if(item == null)
                    {
                        input.value = generateUniqueID(); 
                    }
                }
    return input;
}

function getMaxZindex()
{

    const maxZIndex = Array.from(document.querySelectorAll('body *'))
    .map(a => parseFloat(window.getComputedStyle(a).zIndex))
    .filter(a => !isNaN(a))
    .sort((a, b) => b - a)[0] + 1 || 1000;

    return maxZIndex;
}
function isEventInChild(parent, event) {
   // //console.log('Checking parent:', parent, 'for event target:', event.target);
    if (parent.contains(event.target)) {
       // //console.log('Event is inside parent:', parent);
        return true;
    }
    const children = parent.children;
    for (let i = 0; i < children.length; i++) {
        if (isEventInChild(children[i], event)) {
            return true;
        }
    }
    return false;
}

function setStopPropagationForChildren(element) {
    const children = element.children;
    for (let i = 0; i < children.length; i++) {
        children[i].onclick = (e) => {
            e.stopPropagation();
        };
        setStopPropagationForChildren(children[i]);
    }
}


function savephoto(input,fileinput,imgeElment) 
{

let colname= fileinput.getAttribute("colname");
let name= fileinput.getAttribute("name");

let parentDiv = $(fileinput).parent()[0]; 

let olload = parentDiv.querySelector("#loadph_" + colname) 
if(olload)
{
    olload.remove();
}
let divload = document.createElement("div")
divload.id = "loadph_" + colname ;

divload.innerHTML='<div style="text-align:center;">	<img src="../../Templates/images/load23.gif" /></div>';
parentDiv.appendChild(divload);
  


        var files = fileinput.get(0).files;
        var fileData = new FormData();

        for (var i = 0; i < files.length; i++) {
            fileData.append("myphotos", files[i]);
        }

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "../../ERP/uploadimage?w=" + "0" + "&h=" + "0");
        xhr.send(fileData);
        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4 && xhr.status == 200) {
                var src1 = xhr.responseText.toString();

                if (src1 != "")
                {
                    input.value =src1;
                }
                divload.remove();
                imgeElment.setAttribute("src", "");
            }
        };
    }
}


</script>