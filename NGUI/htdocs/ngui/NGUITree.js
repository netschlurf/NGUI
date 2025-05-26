class NGUITree {
  constructor(targetSelector, config = {}) {
    this.targetSelector = targetSelector;
    this.config = {
      iconSet: config.iconSet || 'awesome5', // Font Awesome 5 by default
      animations: config.animations !== false, // Animations enabled by default
      columns: config.columns || [], // No default columns for generic behavior
      onNodeClick: config.onNodeClick || null,
      onNodeDrag: config.onNodeDrag || null,
      onNodeDrop: config.onNodeDrop || null,
    };
    this.tree = null;
    this.initTableStructure();
    this.initTree();
  }

  // Ensure table structure with <thead> and <th> elements before FancyTree initialization
  initTableStructure() {
    const $table = $(this.targetSelector);
    // Remove existing thead to avoid duplicates
    $table.find('thead').remove();
    // Create thead with at least the Name column
    const $thead = $('<thead><tr><th class="fancytree-resize">Name</th></tr></thead>');
    // Add additional th elements based on columns config
    this.config.columns.forEach(col => {
      $thead.find('tr').append(`<th class="fancytree-resize">${col.title}</th>`);
    });
    // Ensure tbody exists
    if ($table.find('tbody').length === 0) {
      $table.append('<tbody></tbody>');
    }
    // Prepend thead to table
    $table.prepend($thead);
    // Apply resizable to th elements if jQuery UI is available
    if ($.fn.resizable) {
      $thead.find('th').each(function(index) {
        $(this).resizable({
          handles: 'e', // Resize handle on the right edge
          minWidth: 50, // Minimum column width
          resize: function(event, ui) {
            // Update corresponding td elements in tbody
            const width = ui.size.width;
            $table.find(`tbody tr td:nth-child(${index + 1})`).css('width', `${width}px`);
            $(this).css('width', `${width}px`);
          }
        });
      });
    } else {
      console.warn('jQuery UI resizable is not available. Column resizing disabled.');
    }
  }

  // Initialize FancyTree with provided or default configuration
  initTree() {
    const self = this;
    $(this.targetSelector).fancytree({
      extensions: ['table', 'glyph', 'dnd5'],
      glyph: {
        preset: this.config.iconSet,
        map: this.getIconMap(this.config.iconSet),
      },
      table: {
        indentation: 16,
        nodeColumnIdx: 0,
        checkboxColumnIdx: null,
        widthFixed: false, // Allow variable column widths for resizing
      },
      animate: this.config.animations,
      dnd5: this.config.onNodeDrag || this.config.onNodeDrop ? {
        dragStart: (node, data) => {
          if (this.config.onNodeDrag) {
            this.config.onNodeDrag(node, data);
          }
          return true;
        },
        dragDrop: (node, data) => {
          if (this.config.onNodeDrop) {
            this.config.onNodeDrop(node, data);
          }
          data.otherNode.moveTo(node, data.hitMode);
        },
      } : null,
      source: [],
      renderColumns: function(event, data) {
        const node = data.node;
        const $tdList = $(node.tr).find('>td');
        self.config.columns.forEach((col, index) => {
          let value;
          if (col.dataSource === 'data') {
            value = node.data[col.field];
            console.log(`Rendering column ${col.field} for node ${node.title}:`, value);
          } else {
            value = node[col.field];
          }
          $tdList.eq(index + 1).text(col.formatter ? col.formatter(value) : (value !== undefined ? value : ''));
        });
      },
      click: function(event, data) {
        if ($(event.target).closest('.fancytree-expander').length) {
          data.node.toggleExpanded();
          return false;
        }
        if (self.config.onNodeClick) {
          self.config.onNodeClick(data);
        }
      },
    });
    this.tree = $.ui.fancytree.getTree(this.targetSelector);
  }

  // Helper to define icon mappings for different icon sets
  getIconMap(iconSet) {
    switch (iconSet) {
      case 'awesome5':
        return {
          folder: 'fa fa-folder-o',
          folderOpen: 'fa fa-folder-open-o',
          document: 'fa fa-file-o',
        };
      case 'material':
        return {
          folder: 'material-icons',
          folderOpen: 'material-icons',
          document: 'material-icons',
          folderClass: 'folder',
          folderOpenClass: 'folder_open',
          documentClass: 'insert_drive_file',
        };
      case 'none':
        return {};
      default:
        return {
          folder: 'fa fa-folder-o',
          folderOpen: 'fa fa-folder-open-o',
          document: 'fa fa-file-o',
        };
    }
  }

  // Set tree data using the specified JSON format
  setData(jsonData) {
    const convertNode = (node) => {
      const converted = {
        title: node.label,
        key: node.id,
        folder: node.children && node.children.length > 0,
        data: node.data || {},
        children: node.children ? node.children.map(convertNode) : [],
      };
      console.log(`Converted node ${node.label}:`, converted.data);
      return converted;
    };
    const treeData = Array.isArray(jsonData) ? jsonData.map(convertNode) : [convertNode(jsonData)];
    this.tree.reload(treeData);
  }

  // Update configuration (e.g., icons, animations, columns, callbacks)
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.destroy();
    this.initTableStructure();
    this.initTree();
  }

  // Get the current tree instance
  getTree() {
    return this.tree;
  }

  // Destroy the tree instance
  destroy() {
    if (this.tree) {
      this.tree.destroy();
      this.tree = null;
    }
  }

  // Helper to define icon mappings for different icon sets
  getIconMap(iconSet) {
    switch (iconSet) {
      case 'fontawesome':
        return {
          folder: 'fa fa-folder',
          folderOpen: 'fa fa-folder-open',
          document: 'fa fa-file',
        };
      case 'material':
        return {
          folder: 'material-icons folder',
          folderOpen: 'material-icons folder_open',
          document: 'material-icons insert_drive_file',
        };
      case 'no-icons':
        return {};
      default:
        return {
          folder: 'fa fa-folder',
          folderOpen: 'fa fa-folder-open',
          document: 'fa fa-file',
        };
    }
  }  

  // Highlight a node by key
  HighLightNode(key) {
    const node = this.tree.getNodeByKey(key);
    if (node) {
      node.setFocus(true)
      node.setActive(true);
      node.setFocus(true);
      node.span.childNodes[2].classList.add("colorFull")
      console.log(`Highlighted node: ${key}`);
    } else {
      console.warn(`Node not found: ${key}`);
    }
  }

  // Collapse a node by key
  CollapsNode(key) {
    const node = this.tree.getNodeByKey(key);
    if (node) {
      node.setExpanded(false);
      console.log(`Collapsed node: ${key}`);
    } else {
      console.warn(`Node not found: ${key}`);
    }
  }

  // Expand a node by key
  ExpandNode(key) {
    const node = this.tree.getNodeByKey(key);
    if (node) {
      node.setExpanded(true);
      console.log(`Expanded node: ${key}`);
    } else {
      console.warn(`Node not found: ${key}`);
    }
  }  
}

const treeConfigs = {
      default: {
        iconSet: 'awesome5',
        animations: true,
        columns: [
          { title: 'Masse', field: 'mass', dataSource: 'data', formatter: (value) => value !== undefined ? value : '' },

        ],
        onNodeClick: (data) => {
          console.log('Node clicked:', data.node.title, data.node.data);
        },
      },
      minimal: {
        iconSet: 'none',
        animations: false,
        columns: [
          { title: 'Name', field: 'label', dataSource: 'data', formatter: (value) => value || '' },
          { title: 'Type', field: 'type', dataSource: 'data', formatter: (value) => value || '' },
        ],
        onNodeClick: (data) => {
          console.log('Minimal config node clicked:', data.node.title);
        },
      },
      material: {
        iconSet: 'material',
        animations: true,
        columns: [
          { title: 'Description', field: 'description', dataSource: 'data', formatter: (value) => value !== undefined ? value.toUpperCase() : 'N/A' },
          { title: 'Details', field: 'mass', dataSource: 'data', formatter: (value) => value !== undefined ? `Mass: ${value}` : '' },
        ],
        onNodeClick: (data) => {
          console.log('Material config node clicked:', data.node.title, data.node.data);
        },
      },
    };


// Export the class for use (assuming a module system or global)
window.NGUITree = NGUITree;