/**
 * Pimcore
 *
 * This source file is available under two different licenses:
 * - GNU General Public License version 3 (GPLv3)
 * - Pimcore Enterprise License (PEL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 * @copyright  Copyright (c) 2009-2016 pimcore GmbH (http://www.pimcore.org)
 * @license    http://www.pimcore.org/license     GPLv3 and PEL
 */

pimcore.registerNS("pimcore.object.variantsTab");
pimcore.object.variantsTab = Class.create(pimcore.object.helpers.gridTabAbstract, {
    systemColumns: ["id", "fullpath"],
    objecttype: "variant",

    fieldObject: {},
    initialize: function(element) {
        this.element = element;
    },

    getLayout: function () {
        this.selectedClass = this.element.data.general.o_className;

        var classStore = pimcore.globalmanager.get("object_types_store");
        var klassIndex = classStore.findExact("text", this.selectedClass);
        var klass = classStore.getAt(klassIndex);
        this.classId = klass.id;

        if (this.layout == null) {

            Ext.Ajax.request({
                url: "/admin/object-helper/grid-get-column-config",
                params: {name: this.selectedClass, gridtype: "grid"},
                success: this.createGrid.bind(this, false)
            });

            this.layout = new Ext.Panel({
                title: t('variants'),
                border: false,
                iconCls: "pimcore_icon_variant",
                layout: "fit",
                listeners: {
                    activate: function() {
                        this.store.load();
                    }.bind(this)
                }
            });
        }

        return this.layout;
    },

    createGrid: function(fromConfig, response) {
        var fields = [];
        if(response.responseText) {
            response = Ext.decode(response.responseText);
            fields = response.availableFields;
            this.gridLanguage = response.language;
            this.sortinfo = response.sortinfo;
        } else {
            fields = response;
        }

        this.fieldObject = {};
        for(var i = 0; i < fields.length; i++) {
            this.fieldObject[fields[i].key] = fields[i];
        }

        var gridHelper = new pimcore.object.helpers.grid(
            this.selectedClass,
            fields,
            "/admin/variants/get-variants",
            {language: this.gridLanguage},
            false
        );

        var itemsPerPage = pimcore.helpers.grid.getDefaultPageSize(-1);


        gridHelper.showSubtype = false;
        gridHelper.showKey = true;
        gridHelper.enableEditor = true;
        gridHelper.baseParams.objectId = this.element.id;

        this.store = gridHelper.getStore();
        this.store.setPageSize(itemsPerPage);

        var gridColumns = gridHelper.getGridColumns();

        gridColumns.push({
            hideable: false,
            xtype: 'actioncolumn',
            width: 30,
            items: [
                {
                    tooltip: t('open'),
                    icon: "/pimcore/static6/img/flat-color-icons/cursor.svg",
                    handler: function (grid, rowIndex) {
                        var data = grid.getStore().getAt(rowIndex);
                        pimcore.helpers.openObject(data.id, "variant");
                    }.bind(this)
                }
            ]
        });
        gridColumns.push({
            hideable: false,
            xtype: 'actioncolumn',
            width: 30,
            items: [
                {
                    tooltip: t('remove'),
                    icon: "/pimcore/static6/img/flat-color-icons/delete.svg",
                    handler: function (grid, rowIndex) {
                        var data = grid.getStore().getAt(rowIndex);
                        Ext.MessageBox.confirm(t('remove_variant'), t('remove_variant_text'),
                                                    this.doDeleteVariant.bind(this, data.id), this);
                    }.bind(this)
                }
            ]
        });


        this.gridfilters = gridHelper.getGridFilters();

        this.pagingtoolbar = pimcore.helpers.grid.buildDefaultPagingToolbar(this.store, {pageSize: itemsPerPage});

        this.languageInfo = new Ext.Toolbar.TextItem({
            text: t("grid_current_language") + ": " + pimcore.available_languages[this.gridLanguage]
        });

        this.toolbarFilterInfo =  new Ext.Button({
            iconCls: "pimcore_icon_filter_condition",
            hidden: true,
            text: '<b>' + t("filter_active") + '</b>',
            tooltip: t("filter_condition"),
            handler: function (button) {
                Ext.MessageBox.alert(t("filter_condition"), button.pimcore_filter_condition);
            }.bind(this)
        });


        this.createSqlEditor();

        this.cellEditing = Ext.create('Ext.grid.plugin.CellEditing', {
            clicksToEdit: 1
        });

        var plugins = [this.cellEditing ];

        this.grid = Ext.create('Ext.grid.Panel', {
            frame: false,
            store: this.store,
            border: true,
            columns: gridColumns,
            columnLines: true,
            plugins: plugins,
            stripeRows: true,
            cls: 'pimcore_object_grid_panel',
            bodyCls: "pimcore_editable_grid",
            trackMouseOver: true,
            viewConfig: {
                forceFit: false,
                xtype: 'patchedgridview'
            },
            selModel: gridHelper.getSelectionColumn(),
            bbar: this.pagingtoolbar,
            tbar: [
                {
                    text: t('add'),
                    handler: this.onAdd.bind(this),
                    iconCls: "pimcore_icon_add"
                },
                '-', this.languageInfo, '-', this.toolbarFilterInfo, '->'
                ,"-",this.sqlEditor
                ,this.sqlButton,"-",{
                    text: t("export_csv"),
                    iconCls: "pimcore_icon_export",
                    handler: function(){

                        Ext.MessageBox.show({
                            title:t('warning'),
                            msg: t('csv_object_export_warning'),
                            buttons: Ext.Msg.OKCANCEL ,
                            fn: function(btn){
                                if (btn == 'ok'){
                                    this.exportPrepare();
                                }
                            }.bind(this),
                            icon: Ext.MessageBox.WARNING
                        });



                    }.bind(this)
                },"-",{
                    text: t("grid_column_config"),
                    iconCls: "pimcore_icon_table_col pimcore_icon_overlay_edit",
                    handler: this.openColumnConfig.bind(this)
                } 
            ],
            listeners: {
                rowdblclick: function (grid, record, tr, rowIndex, e, eOpts ) {

                }.bind(this)
            }
        });
        this.grid.on("rowcontextmenu", this.onRowContextmenu.bind(this));

        this.grid.on("afterrender", function (grid) {
            this.updateGridHeaderContextMenu(grid);
        }.bind(this));

        this.grid.on("sortchange", function(grid, sortinfo) {
            this.sortinfo = sortinfo;
        }.bind(this));

        // check for filter updates
        this.grid.on("filterchange", function () {
            this.filterUpdateFunction(this.grid, this.toolbarFilterInfo);
        }.bind(this));

        gridHelper.applyGridEvents(this.grid);

        // this.store.load();

        this.layout.removeAll();
        this.layout.add(this.grid);
        this.layout.updateLayout();
    },

    onRowContextmenu: function (grid, record, tr, rowIndex, e, eOpts ) {
        //$(grid.getView().getRow(rowIndex)).animate( { backgroundColor: '#E0EAEE' }, 100)
        //                                                .animate( { backgroundColor: '#fff' }, 400);

        var menu = new Ext.menu.Menu();
        var data = grid.getStore().getAt(rowIndex);

        menu.add(new Ext.menu.Item({
            text: t('rename'),
            iconCls: "pimcore_icon_key pimcore_icon_overlay_go",
            handler: function (data) {
                Ext.MessageBox.prompt(t('rename'), t('please_enter_the_new_name'),
                                                this.editKey.bind(this, data.id), null, null, data.data.filename);
            }.bind(this, data)
        }));

        e.stopEvent();
        menu.showAt(e.getXY());
    },

    editKey: function (id, button, value) {
        if (button == "ok") {
            Ext.Ajax.request({
                url: "/admin/variants/update-key",
                params: {id: id, key: value},
                success: function(response) {
                    this.store.reload();
                    var responseJson = Ext.decode(response.responseText);
                    if(!responseJson.success) {
                        pimcore.helpers.showNotification(t("error"), t("error_renaming_variant"), "error",
                                                         t(responseJson.message));
                    }
                }.bind(this)
            });
        }
    },


    onAdd: function (btn, ev) {
        Ext.MessageBox.prompt(t('add_variant'), t('please_enter_the_name_of_the_new_variant'), this.doAdd.bind(this));
    },

    doAdd: function(button, value) {
        if (button == "ok") {
            Ext.Ajax.request({
                url: "/admin/object/add",
                params: {
                    className: this.element.data.general.o_className,
                    classId: this.element.data.general.o_classId,
                    parentId: this.element.id,
                    objecttype: "variant",
                    key: pimcore.helpers.getValidFilename(this.element.data.general.o_key + "_" + value)
                },
                success: function(response) {
                    var responseJson = Ext.decode(response.responseText);
                    if(responseJson.success) {
                        this.store.reload();
                        pimcore.helpers.openObject(responseJson.id, responseJson.type);
                    } else {
                        pimcore.helpers.showNotification(t("error"), t("error_creating_variant"), "error",
                                                         t(responseJson.message));
                    }
                }.bind(this)
            });
        }
    },


    doDeleteVariant: function(id, answer) {
        if(answer == "yes") {
            if (pimcore.globalmanager.exists("object_" + id)) {
                var tabPanel = Ext.getCmp("pimcore_panel_tabs");
                tabPanel.remove("object_" + id);
            }

            Ext.Ajax.request({
                url: "/admin/object/delete",
                params: {
                    id: id
                },
                success: function (response) {
                    try {
                        //Ext.get(this.getUI().getIconEl()).dom.setAttribute("class", this.originalClass);
                        var rdata = Ext.decode(response.responseText);
                        if (rdata && !rdata.success) {
                            pimcore.helpers.showNotification(t("error"), t("error_deleting_variant"), "error",
                                                             t(rdata.message));
                        }
                    } catch(e) {
                        pimcore.helpers.showNotification(t("error"), t("error_deleting_variant"), "error");
                    }
                    this.store.reload();
                }.bind(this)
            });
        }
    }

});