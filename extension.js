/* 
	BaBar
	(c) Francois Thirioux 2021
	Contributors: @fthx, @wooque, @frandieguez, @kenoh, @justperfection
	License GPL v3
*/

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
//const AppMenu = Main.panel.statusArea.appMenu;
const PanelBox = Main.layoutManager.panelBox;
const WM = global.workspace_manager;
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const N_ = x => x;

// workspaces names from native schema
var WORKSPACES_SCHEMA = "org.gnome.desktop.wm.preferences";
var WORKSPACES_KEY = "workspace-names";

// workspace settings from mutter schema.
var MUTTER_SCHEMA = "org.gnome.mutter";
var PRIMARY_WORKSPACES_KEY = "workspaces-only-on-primary";
var DYNAMIC_WORKSPACES_KEY = "dynamic-workspaces";

// initial fallback settings
var WORKSPACES_RIGHT_CLICK = false;
var RIGHT_CLICK = true;
var MIDDLE_CLICK = true;
var REDUCE_PADDING = true;
var APP_GRID_ICON_NAME = 'view-app-grid-symbolic';
var PLACES_ICON_NAME = 'folder-symbolic';
var FAVORITES_ICON_NAME = 'starred-symbolic';
var FALLBACK_ICON_NAME = 'applications-system-symbolic';
var ICON_SIZE = 18;
var PLAIN_WORKSPACES_BUTTONS = true;
var ROUNDED_WORKSPACES_BUTTONS = false;
var FLAT_WORKSPACES_BUTTONS = false;
var TOOLTIP_VERTICAL_PADDING = 10;
var THUMBNAIL_MAX_SIZE = 25;
var HIDDEN_OPACITY = 127;
var UNFOCUSED_OPACITY = 255;
var FOCUSED_OPACITY = 255;
var DESATURATE_ICONS = false;
var BOTTOM_PANEL = false;
var FAVORITES_FIRST = false;
var POSITION_SORT = false;
var DISPLAY_ACTIVITIES = false;
var DISPLAY_APP_GRID = true;
var DISPLAY_PLACES_ICON = true;
var DISPLAY_FAVORITES = true;
var DISPLAY_WORKSPACES = true;
var DISPLAY_TASKS = true;
var TASKS_POSITION = 'left';
var DISPLAY_APP_MENU = false;
var DISPLAY_DASH = true;
var DISPLAY_WORKSPACES_THUMBNAILS = true;
var MIN_TASKS_PER_WORKSPACE = 0;
var ALL_WORKSPACES_LABEL = '';

let extension;


var AppGridButton = GObject.registerClass(
class AppGridButton extends PanelMenu.Button {
	_init() {
		super._init(0.0, 'Babar-AppGrid');
		
		this.app_grid_button = new St.BoxLayout({visible: true, reactive: true, can_focus: true, track_hover: true});
		this.app_grid_button.icon = new St.Icon({icon_name: APP_GRID_ICON_NAME, style_class: 'system-status-icon'});
        this.app_grid_button.add_child(this.app_grid_button.icon);
		this.app_grid_button.connect('button-release-event', this._show_apps_page.bind(this));
        this.add_child(this.app_grid_button);
	}

	_show_apps_page() {
		if (Main.overview.visible) {
			Main.overview.hide();
		} else {
			Main.overview.showApps();
		}
	}
	
	_destroy() {
		super.destroy();
	}
});

var FavoritesMenu = GObject.registerClass(
class FavoritesMenu extends PanelMenu.Button {
	_init() {
		super._init(0.0, 'Babar-Favorites');
		
		this.fav_changed = AppFavorites.getAppFavorites().connect('changed', this._display_favorites.bind(this));
		
    	this.fav_menu_button = new St.BoxLayout({});
		this.fav_menu_icon = new St.Icon({icon_name: FAVORITES_ICON_NAME, style_class: 'system-status-icon'});
        this.fav_menu_button.add_child(this.fav_menu_icon);
        this.add_child(this.fav_menu_button);

		this._display_favorites();
	}
	
	// display favorites menu
	_display_favorites() {
		// destroy old menu items
		if (this.menu) {
			this.menu.removeAll();
		}
		
		// get favorites list
    	this.list_fav = AppFavorites.getAppFavorites().getFavorites();
        
        // create favorites items
		for (let fav_index = 0; fav_index < this.list_fav.length; ++fav_index) {
    		this.fav = this.list_fav[fav_index];
    		this.fav_icon = this.fav.create_icon_texture(64);

			this.item = new PopupMenu.PopupImageMenuItem(this.fav.get_name(), this.fav_icon.get_gicon());
    		this.item.connect('activate', () => this._activate_fav(fav_index));
    		this.menu.addMenuItem(this.item);
			
			// drag and drop
			this.item.fav_index = fav_index;
			this.item.is_babar_favorite = true;

			this.item._delegate = this.item;
			this.item._draggable = DND.makeDraggable(this.item, {dragActorOpacity: HIDDEN_OPACITY});
			
			this.item._draggable.connect('drag-end', this._on_drag_end.bind(this));
			this.item._draggable.connect('drag-cancelled', this._on_drag_end.bind(this));
    	}
	}

	// on drag cancelled or ended
	_on_drag_end() {
		this.menu.close();
		this._display_favorites();
	}
	
	// activate favorite
	_activate_fav(fav_index) {
    	AppFavorites.getAppFavorites().getFavorites()[fav_index].open_new_window(-1);
    }
    
    // remove signals, destroy workspaces bar
	_destroy() {
		if (this.fav_changed) {
			AppFavorites.getAppFavorites().disconnect(this.fav_changed);
		}
		super.destroy();
	}
});


class WindowContextMenu extends PopupMenu.PopupMenu {
	constructor(source, w_box, metaWindow) {
		super(w_box, 0.5, St.Side.BOTTOM);
		console.log("rbrent start");
		this.actor.add_style_class_name('window-menu');
		this.window_tracker = Shell.WindowTracker.get_default();
		this.actor.hide();
		this.actor.connect('destroy', this._onDestroy.bind(this));
		source.connect('destroy', this._onDestroy.bind(this));
		source._contextMenuManager.addMenu(this);
		Main.uiGroup.add_child(this.actor);
		this._buildMenu(metaWindow);
	}

	_buildMenu(metaWindow) {

		this._metaWindow = metaWindow;
		/* ---------------------------------------------------------------- */
		//this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(metaWindow.get_title()))

		this._newWindowItem = new PopupMenu.PopupMenuItem(_('New Window'));
		this._newWindowItem.connect('activate', () => {
			let app = this.window_tracker.get_window_app(metaWindow);
			app.open_new_window(-1);
			Main.overview.hide();
		});
		this.addMenuItem(this._newWindowItem);

		/* ---------------------------------------------------------------- */
		this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

		this._minimizeItem = new PopupMenu.PopupMenuItem(_('Minimize'));
		this._minimizeItem.connect('activate', () => {
			if (this._metaWindow.minimized)
				this._metaWindow.unminimize();
			else
				this._metaWindow.minimize();
		});
		this.addMenuItem(this._minimizeItem);
		this._notifyMinimizedId = this._metaWindow.connect(
			'notify::minimized', this._updateMinimizeItem.bind(this));
		this._updateMinimizeItem();

		this._maximizeItem = new PopupMenu.PopupMenuItem(_('Maximize'));
		this._maximizeItem.connect('activate', () => {
			if (this._metaWindow.get_maximized() === Meta.MaximizeFlags.BOTH)
				this._metaWindow.unmaximize(Meta.MaximizeFlags.BOTH);
			else
				this._metaWindow.maximize(Meta.MaximizeFlags.BOTH);
		});
		this.addMenuItem(this._maximizeItem);
		this._notifyMaximizedHId = this._metaWindow.connect(
			'notify::maximized-horizontally',
			this._updateMaximizeItem.bind(this));
		this._notifyMaximizedVId = this._metaWindow.connect(
			'notify::maximized-vertically',
			this._updateMaximizeItem.bind(this));
		this._updateMaximizeItem();


		this._moveItem = new PopupMenu.PopupMenuItem(_('Move'));
		this._moveItem.connect('activate', (_, event)  => {
			this._grabAction(this._metaWindow, Meta.GrabOp.KEYBOARD_MOVING, event.get_time());
		});
		this.addMenuItem(this._moveItem);

		this._resizeItem = new PopupMenu.PopupMenuItem(_('Resize'));
		this._resizeItem.connect('activate', (_, event)  => {
			this._grabAction(this._metaWindow, Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN, event.get_time());
		});
		this.addMenuItem(this._resizeItem);

		this._alwaysOnTopItem = new PopupMenu.PopupMenuItem(_('Always on Top'));
		this._alwaysOnTopItem.connect('activate', () => {
            if (this._metaWindow.is_above())
                this._metaWindow.unmake_above();
            else
                this._metaWindow.make_above();
			this._updateAlwaysOnTopItem();
		});
		this.addMenuItem(this._alwaysOnTopItem);
		this._updateAlwaysOnTopItem();

		/* ---------------------------------------------------------------- */
		this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

		this._closeItem = new PopupMenu.PopupMenuItem(_('Close'));
		this._closeItem.connect('activate', () => {
			this._metaWindow.delete(global.get_current_time());
		});
		this.addMenuItem(this._closeItem);

		this._decorateItem = new PopupMenu.PopupMenuItem(_(this._metaWindow.decorated ? 'Undecorate' : 'Decorate'));
		this._decorateItem.connect('activate', () => {
			if (this._metaWindow.decorated)
				undecorate(this._metaWindow);
			else
				decorate(this._metaWindow);
		});
		this.addMenuItem(this._decorateItem);

		this.connect('open-state-changed', (o, b, d) => {
			console.log("rbrent, isopen", this.isOpen);
			if (!this.isOpen)
				return;
			Main.panel.menuManager.addMenu(this);
			//Main.layoutManager.uiGroup.add_actor(this.actor);

			this._minimizeItem.setSensitive(this._metaWindow.can_minimize());
			this._maximizeItem.setSensitive(this._metaWindow.can_maximize());
			this._moveItem.setSensitive(this._metaWindow.allows_move());
			this._resizeItem.setSensitive(this._metaWindow.allows_resize());
			this._alwaysOnTopItem.setSensitive(this._metaWindow.get_maximized() != Meta.MaximizeFlags.BOTH);
			this._closeItem.setSensitive(this._metaWindow.can_close());
		});
	}

	_updateMinimizeItem() {
		this._minimizeItem.label.text = this._metaWindow.minimized
			? _('Unminimize') : _('Minimize');
	}

	_updateMaximizeItem() {
		let maximized = this._metaWindow.maximized_vertically &&
			this._metaWindow.maximized_horizontally;
		this._maximizeItem.label.text = maximized
			? _('Unmaximize') : _('Maximize');
	}

	_updateAlwaysOnTopItem() {
		if (this._metaWindow.is_above())
            this._alwaysOnTopItem.setOrnament(PopupMenu.Ornament.CHECK);
		else
            this._alwaysOnTopItem.setOrnament(PopupMenu.Ornament.NONE);
	}

    _grabAction(window, grabOp, time) {
        if (global.display.get_grab_op() == Meta.GrabOp.NONE) {
            window.begin_grab_op(grabOp, true, time);
            return;
        }

        let waitId = 0;
        let id = global.display.connect('grab-op-end', display => {
            display.disconnect(id);
            GLib.source_remove(waitId);

            window.begin_grab_op(grabOp, true, time);
        });

        waitId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            global.display.disconnect(id);
            return GLib.SOURCE_REMOVE;
        });
    }

	_onDestroy() {
		this._metaWindow.disconnect(this._notifyMinimizedId);
		this._metaWindow.disconnect(this._notifyMaximizedHId);
		this._metaWindow.disconnect(this._notifyMaximizedVId);
	}
}

var WorkspacesBar = GObject.registerClass(
class WorkspacesBar extends PanelMenu.Button {
	_init() {
		super._init(0.0, 'Babar-Tasks');
		this.add_style_class_name('workspaces-bar');

		// tracker for windows
		this.window_tracker = Shell.WindowTracker.get_default();
		
		// define gsettings schema for workspaces names, get workspaces names, signal for settings key changed
		this.ws_settings = new Gio.Settings({schema: WORKSPACES_SCHEMA});
		this.ws_names_changed = this.ws_settings.connect(`changed::${WORKSPACES_KEY}`, this._update_ws_names.bind(this));
		
		// define gsettings schema for mutter, get if workspaces are dynamic and primary monitor-only, signal on change.
		this.mutter_settings = new Gio.Settings({schema: MUTTER_SCHEMA});
		this.ws_primary_changed = this.mutter_settings.connect(`changed::${PRIMARY_WORKSPACES_KEY}`, this._update_ws_primary.bind(this));
		this.ws_dynamic_changed = this.mutter_settings.connect(`changed::${DYNAMIC_WORKSPACES_KEY}`, this._update_ws_dynamic.bind(this));
		this._is_ws_dynamic = this.mutter_settings.get_boolean(DYNAMIC_WORKSPACES_KEY);
		
		this._custom_icons = new Map();
		this._update_custom_icons();

		// define windows that need an icon (see https://www.roojs.org/seed/gir-1.2-gtk-3.0/seed/Meta.WindowType.html)
		this.window_type_whitelist = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG];
		
		// bar creation
		this.ws_bar = new St.BoxLayout({});
        this._update_ws_names();
        this.add_child(this.ws_bar);
		this._contextMenuManager = new PopupMenu.PopupMenuManager(this);
        
		// window thumbnail
		if (RIGHT_CLICK) {
			this.window_thumbnail = new WindowThumbnail();
			this.window_thumbnail.overview = Main.overview.connect('showing', () => this.window_thumbnail._remove());
		}
		
		// window button tooltip
		this.window_tooltip = new WindowTooltip();
        
        // signals
		this._ws_number_changed = WM.connect('notify::n-workspaces', this._update_ws.bind(this));
		this._active_ws_changed = WM.connect('active-workspace-changed', this._update_ws.bind(this));
		this._windows_changed = this.window_tracker.connect('tracked-windows-changed', this._update_ws.bind(this));
		this._restacked = global.display.connect('restacked', this._update_ws.bind(this));
		//this._window_left_monitor = global.display.connect('window-left-monitor', this._update_ws.bind(this));
		//this._window_entered_monitor = global.display.connect('window-entered-monitor', this._update_ws.bind(this));
	}

	// remove signals, restore Activities button, destroy workspaces bar
	_destroy() {
		if (this.ws_settings && this.ws_names_changed) {
			this.ws_settings.disconnect(this.ws_names_changed);
		}

		if (this.mutter_settings && this.ws_primary_changed) {
			this.mutter_settings.disconnect(this.ws_primary_changed);
		}

		if (this.mutter_settings && this.ws_dynamic_changed) {
			this.mutter_settings.disconnect(this.ws_dynamic_changed);
		}

		if (this._ws_number_changed) {
			WM.disconnect(this._ws_number_changed);
		}

		if (this._active_ws_changed) {
			WM.disconnect(this._active_ws_changed);
		}

		if (this.window_tracker && this._windows_changed) {
			this.window_tracker.disconnect(this._windows_changed);
		}

		if (this._restacked) {
			global.display.disconnect(this._restacked);
		}

		//if (this._window_left_monitor) {
		//	global.display.disconnect(this._window_left_monitor);
		//}

		//if (this._window_entered_monitor) {
		//	global.display.disconnect(this._window_entered_monitor);
		//}

		if (this.hide_tooltip_timeout) {
			GLib.source_remove(this.hide_tooltip_timeout);
		}

		if (this.window_tooltip) {
			this.window_tooltip.destroy();
		}

		if (this.window_thumbnail) {
			Main.overview.disconnect(this.window_thumbnail.overview);
			if (this.window_thumbnail.timeout) {
				GLib.source_remove(this.window_thumbnail.timeout);
			}
			this.window_thumbnail.destroy();
		}

		this.ws_bar.destroy();
		super.destroy();
	}
	
	// update workspaces names
	_update_ws_names() {
		this.ws_names = this.ws_settings.get_strv(WORKSPACES_KEY);
		this._update_ws();
	}

	// update if workspaces are dynamic.
	_update_ws_dynamic(){
		this._is_ws_dynamic = this.mutter_settings.get_boolean(DYNAMIC_WORKSPACES_KEY);
		this._update_ws();
	}

	// Update if workspaces should only display on primary vs all monitors.
	_update_ws_primary(){
		this._update_ws();
	}
	
	// update custom icons
	_update_custom_icons() {
		//https://www.andyholmes.ca/articles/dbus-in-gjs.html
		//recursiveUnpack
		//https://github.com/ubuntu/gnome-shell-extension-appindicator/blob/master/extension.js
		//https://github.com/ubuntu/gnome-shell-extension-appindicator/blob/master/appIndicator.js
		
	}

	// update the workspaces bar
    _update_ws() {
		// destroy old workspaces bar buttons and signals
    	this.ws_bar.destroy_all_children();
    	
    	// get number of workspaces
        this.ws_count = WM.get_n_workspaces();
        this.active_ws_index = WM.get_active_workspace_index();

		let button_type = "squared";
		if (FLAT_WORKSPACES_BUTTONS) {
			button_type = "flat";
		} else if (ROUNDED_WORKSPACES_BUTTONS) {
			button_type = "rounded";
		}
		if (PLAIN_WORKSPACES_BUTTONS) {
			button_type = "plain";
		}
        		
		// display all current workspaces and tasks buttons
        for (let ws_index = 0; ws_index < this.ws_count; ++ws_index) {
        	// workspace
			let ws_box = new WorkspaceButton();
			ws_box.number = ws_index;
			let ws_box_label = new St.Label({y_align: Clutter.ActorAlign.CENTER});
			ws_box_label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
			
			// rounded buttons option
			if (ws_index == this.active_ws_index) {
				ws_box_label.style_class = 'workspace-active-' + button_type;
				ws_box.style_class = 'workspace-box-active-' + button_type;
			} else {
				ws_box_label.style_class = 'workspace-inactive-' + button_type;
				ws_box.style_class = 'workspace-box-inactive-' + button_type;
			}
			
			// workspace numbered label
			if (this.ws_names[ws_index]) {
				ws_box_label.set_text("  " + this.ws_names[ws_index] + "  ");
			} else {
				ws_box_label.set_text("  " + (ws_index + 1) + "  ");
			}
			ws_box.set_child(ws_box_label);

			// signal
			ws_box.connect('button-release-event', (widget, event) => this._toggle_ws(widget, event, ws_index));

			// add in task bar
			if (DISPLAY_WORKSPACES) {
	        	this.ws_bar.add_child(ws_box);
	        }
	        
	        // tasks
	        this.ws_current = WM.get_workspace_by_index(ws_index);
			if (FAVORITES_FIRST) {
				this.favorites_list = AppFavorites.getAppFavorites().getFavorites();
				this.ws_current.windows = this.ws_current.list_windows().sort(this._sort_windows_favorites_first.bind(this));
			} else if (POSITION_SORT) {
				this.ws_current.windows = this.ws_current.list_windows().sort(this._sort_windows_by_position.bind(this));
			} else {
	        	this.ws_current.windows = this.ws_current.list_windows().sort(this._sort_windows);
			}
			let task_total = 0;
	        for (let window_index = 0; window_index < this.ws_current.windows.length; ++window_index) {
	        	this.window = this.ws_current.windows[window_index];
	        	if (this.window && !this.window.is_skip_taskbar() && this.window_type_whitelist.includes(this.window.get_window_type())) {
	        	    this._create_window_button(ws_index, this.window, button_type);
					if (!this.window.is_on_all_workspaces()) {
						++task_total;
					}
	        	}
	        }

			let size = MIN_TASKS_PER_WORKSPACE - task_total;
			// for dynamic workspaces, make the last entry a + when inactive.
			if (this._is_ws_dynamic && task_total == 0 && this.active_ws_index != ws_index  && ws_index == WM.n_workspaces -1) {
				size = 0;
				ws_box_label.set_text("    +    ");
			}
			this._create_workspace_seperator(ws_index, size, button_type);
		}
		if (ALL_WORKSPACES_LABEL) {
			let ws_box = new WorkspaceButton();
			ws_box.number = -1;
			let ws_box_label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
			ws_box_label.style_class = 'workspace-inactive-' + button_type;
			ws_box.style_class = 'workspace-box-inactive-' + button_type;
			ws_box_label.set_text(" " + ALL_WORKSPACES_LABEL + " ");
			ws_box.set_child(ws_box_label);
			ws_box.connect('button-release-event', (widget, event) => this._toggle_ws(widget, event, -1));
			this.ws_bar.insert_child_at_index(ws_box, 0);
		}
    }
    
	_create_workspace_seperator(ws_index, size, button_type) {
		let box = new WorkspaceButton();
		if (ws_index == this.active_ws_index) {
			box.style_class = 'workspace-seperator-active-' + button_type;
		} else {
			box.style_class = 'workspace-seperator-inactive-' + button_type;
		}
		box.number = ws_index;
		box.set_style('min-width: '+ ((size > 0 ? size : 0) * (8 + ICON_SIZE)) + 'px');
		box.connect('button-release-event', (widget, event) => this._toggle_ws(widget, event, ws_index));
		this.ws_bar.add_child(box);
	}

    // create window button ; ws = workspace, w = window, button_type
	_create_window_button(ws_index, w, button_type) {
        // windows on all workspaces have to be displayed only once
    	if (!w.is_on_all_workspaces() || ws_index == 0) {
		    // create button
			let w_box = new WindowButton();
			w_box.window = w;
			w_box.workspace_number = ws_index;
		    let w_box_app = this.window_tracker.get_window_app(w);

		    // create w button and its icon
		    let w_box_icon = this._create_window_icon(w_box_app, w_box.window);
			w_box.set_child(w_box_icon);

			// signals
			w_box.connect('button-release-event', (widget, event) => this._on_button_press(widget, event, w_box, ws_index, w));
			w_box.connect('notify::hover', () => this._on_button_hover(w_box, w.title));
			
			// desaturate option
			if (DESATURATE_ICONS) {
				this.desaturate = new Clutter.DesaturateEffect();
				w_box_icon.add_effect(this.desaturate);
			}
		    
			let window_workspace_class = 'window-workspace-inactive-' + button_type;
			if (ws_index == WM.get_active_workspace_index() && !w.is_on_all_workspaces()) {
				if (w.has_focus()) {
					window_workspace_class = 'window-focused-workspace-active-' + button_type;
				} else {
					window_workspace_class = 'window-workspace-active-' + button_type;
				}
			}
			// set icon style and opacity following window state
		    if (w.is_hidden()) {
				w_box.style_class = 'window-hidden ' +  window_workspace_class;
				w_box_icon.set_opacity(HIDDEN_OPACITY);
		    } else {
				if (w.has_focus()) {
					w_box.style_class = 'window-focused ' + window_workspace_class;
					w_box_icon.set_opacity(FOCUSED_OPACITY);
				} else {
					w_box.style_class = 'window-unfocused ' + window_workspace_class;
					w_box_icon.set_opacity(UNFOCUSED_OPACITY);
				}
		    }
			
		    // add in task bar
		   	if (w.is_on_all_workspaces()) {
		   		this.ws_bar.insert_child_at_index(w_box, 0);	
		   	} else {
		    	this.ws_bar.add_child(w_box);
		    }
		}
	}

	// create window icon with fallbacks; app = app, w = metawindow
	_create_window_icon(app, w) {
		let icon;
		if (app) {
			icon = app.create_icon_texture(ICON_SIZE);
		}
		// sometimes no icon is defined or icon is void, at least for a short time
		if (!icon || icon.get_style_class_name() == 'fallback-app-icon') {
			icon = new St.Icon({icon_name: w.get_wm_class() || w.get_title(), icon_size: ICON_SIZE});
			if (!icon || icon.get_style_class_name() == 'fallback-app-icon') {
				icon = new St.Icon({icon_name: FALLBACK_ICON_NAME, icon_size: ICON_SIZE});
			}
		}
		if (w.get_wm_class() == "" && w.get_title().includes("Vivaldi")) {
			icon = new St.Icon({icon_name: "vivaldi", icon_size: ICON_SIZE});
		}
		return icon;
	}

	// on window w button press
    _on_button_press(widget, event, w_box, ws_index, w) {
    	// left-click: toggle window
    	if (event.get_button() == 1) {
			this.window_tooltip.hide();
			if (w.has_focus() && !Main.overview.visible) {
				if (w.can_minimize()) {
		   			w.minimize();
		   		}
		   	} else {	
				w.activate(global.get_current_time());
			}
			if (Main.overview.visible) {
				Main.overview.hide();
			}
			if (!w.is_on_all_workspaces()) {
				WM.get_workspace_by_index(ws_index).activate(global.get_current_time());
			}
		}
		
		// right-click: display window thumbnail
		if (RIGHT_CLICK && event.get_button() == 3) {
			if (!this.window_thumbnail.visible || this.window_thumbnail.window_id !== w.get_id()) {
				this.window_tooltip.hide();
				this.window_thumbnail.window = w.get_compositor_private();

				if (this.window_thumbnail.window && this.window_thumbnail.window.get_size()[0] && this.window_thumbnail.window.get_texture()) {
					[this.window_thumbnail.width, this.window_thumbnail.height] = this.window_thumbnail.window.get_size();
					this.window_thumbnail.max_width = THUMBNAIL_MAX_SIZE / 100 * global.display.get_size()[0];
					this.window_thumbnail.max_height = THUMBNAIL_MAX_SIZE / 100 * global.display.get_size()[1];
					this.window_thumbnail.scale = Math.min(1.0, this.window_thumbnail.max_width / this.window_thumbnail.width, this.window_thumbnail.max_height / this.window_thumbnail.height);
					
					this.window_thumbnail.clone.set_source(this.window_thumbnail.window);
					this.window_thumbnail.clone.set_size(this.window_thumbnail.scale * this.window_thumbnail.width, this.window_thumbnail.scale * this.window_thumbnail.height);
					this.window_thumbnail.set_size(this.window_thumbnail.scale * this.window_thumbnail.width, this.window_thumbnail.scale * this.window_thumbnail.height);

					this.window_thumbnail.set_position(w_box.get_transformed_position()[0], Main.layoutManager.primaryMonitor.y + Main.panel.height + TOOLTIP_VERTICAL_PADDING);
					this.window_thumbnail.show();
					this.window_thumbnail.window_id = w.get_id();

					// remove thumbnail content and hide thumbnail if its window is destroyed
					this.window_thumbnail.destroy_signal = this.window_thumbnail.window.connect('destroy', () => {
						if (this.window_thumbnail) {
							this.window_thumbnail._remove();
						}
					});
				}
			} else {
				this.window_thumbnail._remove();
			}
		} else if (event.get_button() == 3) {
			if (this._window_context_menu && this._window_context_menu.active) {
				this._window_context_menu.destroy();
				this._window_context_menu = false;
			} else {
				this._window_context_menu = new WindowContextMenu(this, w_box, w);
				this._window_context_menu.open();
			}
		}
		
		// middle-click: close window
		if (MIDDLE_CLICK && event.get_button() == 2 && w.can_close()) {
			w.delete(global.get_current_time());
			this.window_tooltip.hide();
		}
    }
    
    // sort windows by creation date
    _sort_windows(w1, w2) {
    	return w1.get_id() - w2.get_id();
    }
    
    // sort windows by favorite order first then by creation date
    _sort_windows_favorites_first(w1, w2) {
		this.w1_app = this.window_tracker.get_window_app(w1);
		this.w2_app = this.window_tracker.get_window_app(w2);
		if (!this.w1_app || !this.w2_app) {
			return 0;
		}
		this.w1_is_favorite = AppFavorites.getAppFavorites().isFavorite(this.w1_app.get_id());
		this.w2_is_favorite = AppFavorites.getAppFavorites().isFavorite(this.w2_app.get_id());

		if (!this.w1_is_favorite && !this.w2_is_favorite) {
			return this._sort_windows(w1, w2);
		}
		if (this.w1_is_favorite && this.w2_is_favorite) {
			if (this.w1_app == this.w2_app) {
				return this._sort_windows(w1, w2);
			} else {
				return this.favorites_list.indexOf(this.w1_app) - this.favorites_list.indexOf(this.w2_app);
			}
		}
		if (this.w1_is_favorite && !this.w2_is_favorite) {
			return -1;
		}
		if (!this.w1_is_favorite && this.w2_is_favorite) {
			return 1;
		}
	}

	// sort windows by position; ported from tint2.
	// https://gitlab.com/o9000/tint2/-/blob/master/src/taskbar/taskbar.c#L693
	_sort_windows_by_position(w1, w2) {
		let r1 = w1.get_frame_rect(), r2 = w2.get_frame_rect();
		// If a window has the same coordinates and size as the other,
		// they are considered to be equal in the comparison.
		if ((r1.x == r2.x) && (r1.y == r2.y) && (r1.width == r2.width) && (r1.height == r2.height)) {
			return 0;
		}

		// If a window is completely contained in another,
		// then it is considered to come after (to the right/bottom) of the other.
		if (this._contained_within(r1, r2))
			return -1;
		if (this._contained_within(r2, r1))
			return 1;

		// Compare centers
		let a_horiz_c = r1.x + r1.width / 2;
		let b_horiz_c = r2.x + r2.width / 2;
		let a_vert_c = r1.y + r1.height / 2;
		let b_vert_c = r2.y + r2.height / 2;
		if (a_horiz_c != b_horiz_c) {
			return a_horiz_c - b_horiz_c;
		}
		return a_vert_c - b_vert_c;
	}

	// check if one frame_rect is contained within another. 
	_contained_within(r1, r2) {
		if ((r1.x <= r2.x) && (r1.y <= r2.y) && (r1.x + r1.width >= r2.x + r2.width) &&
			(r1.y + r1.height >= r2.y + r2.height)) {
			return true;
		}
		return false;
	}

    // toggle or show overview
    _toggle_ws(widget, event, ws_index) {
		if (ws_index < 0) {
			Main.overview.toggle();
		} else if (WORKSPACES_RIGHT_CLICK) {
			// left click: show workspace
			if (event.get_button() == 1) {
				WM.get_workspace_by_index(ws_index).activate(global.get_current_time());
				Main.overview.hide();
			}

			// right click: show workspace's overview
			if (event.get_button() == 3) {
				if (ws_index == WM.get_active_workspace_index()) {
					Main.overview.toggle();
				} else {
					WM.get_workspace_by_index(ws_index).activate(global.get_current_time());
					Main.overview.show();
				}
			}
		} else {
			if (ws_index == WM.get_active_workspace_index()) {
				Main.overview.toggle();
			} else {
				WM.get_workspace_by_index(ws_index).activate(global.get_current_time());
				Main.overview.show();
			}
		}
    }
    
    // on w button hover: toggle tooltip
    _on_button_hover(w_box, window_title) {
		if (window_title && w_box && w_box.get_hover()) {
			this.window_tooltip.set_position(w_box.get_transformed_position()[0], Main.layoutManager.primaryMonitor.y + Main.panel.height + TOOLTIP_VERTICAL_PADDING);
			this.window_tooltip.label.set_text(window_title);
			this.window_tooltip.show();
			this.hide_tooltip_timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
				if (!Main.panel.statusArea['babar-workspaces-bar'].get_hover()) {
					this.window_tooltip.hide()
				}
			});
		} else {
			this.window_tooltip.hide();
		}
    }
});

var WindowTooltip = GObject.registerClass(
class WindowTooltip extends St.BoxLayout {
	_init() {
		super._init({style_class: 'window-tooltip'});

		this.label = new St.Label({y_align: Clutter.ActorAlign.CENTER, text: ""});
		this.add_child(this.label);
		this.hide();
		Main.layoutManager.addChrome(this);
	}
});        

var WindowThumbnail = GObject.registerClass(
class WindowThumbnail extends St.Bin {
	_init() {
		super._init({visible: true, reactive: true, can_focus: true, track_hover: true, style_class: 'window-thumbnail'});

		this.connect('button-release-event', this._remove.bind(this));

		this._delegate = this;
		this._draggable = DND.makeDraggable(this, {dragActorOpacity: HIDDEN_OPACITY});

		this.saved_snap_back_animation_time = DND.SNAP_BACK_ANIMATION_TIME;

		this._draggable.connect('drag-end', this._end_drag.bind(this));
		this._draggable.connect('drag-cancelled', this._end_drag.bind(this));

		this.clone = new Clutter.Clone({reactive: true});
		this.set_child(this.clone);
		this._remove();
		Main.layoutManager.addChrome(this);
	}

	_remove() {
		if (this.clone) {
			this.clone.set_source(null);
		}
		this.hide();
	}

	_end_drag() {
		this.set_position(this._draggable._dragOffsetX + this._draggable._dragX, this._draggable._dragOffsetY + this._draggable._dragY);
		DND.SNAP_BACK_ANIMATION_TIME = 0;
		this.timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 0, () => {
			DND.SNAP_BACK_ANIMATION_TIME = this.saved_snap_back_animation_time;
		});
	}
});

var WorkspaceButton = GObject.registerClass(
class WorkspaceButton extends St.Bin {
	_init() {
		super._init({visible: true, reactive: true, can_focus: true, track_hover: true});

		this._delegate = this;
	}

	acceptDrop(source) {
		// favorite menu item
		if (source.is_babar_favorite) {
			WM.get_workspace_by_index(this.number).activate(global.get_current_time());
			AppFavorites.getAppFavorites().getFavorites()[source.fav_index].open_new_window(-1);
		}

		// window button
		if (source.is_babar_task && source.workspace_number !== this.number) {
			source.window.change_workspace_by_index(this.number, false);
			if (source.window.has_focus()) {
				source.window.activate(global.get_current_time());
			}
			return true;
		}

		// dash button
		if (source instanceof Dash.DashIcon) {
			Main.overview.hide();
			WM.get_workspace_by_index(this.number).activate(global.get_current_time());
			source.app.open_new_window(-1);
			return true;
		}

		// app grid button
		if (source instanceof AppDisplay.AppIcon) {
			Main.overview.hide();
			WM.get_workspace_by_index(this.number).activate(global.get_current_time());
			source.app.open_new_window(-1);
			return true;
		}

		return false;
	}	
});

var WindowButton = GObject.registerClass(
class WindowButton extends St.Bin {
	_init() {
		super._init({visible: true, reactive: true, can_focus: true, track_hover: true});

		this.is_babar_task = true;

		this._delegate = this;
		this._draggable = DND.makeDraggable(this, {dragActorOpacity: HIDDEN_OPACITY});

		this._draggable.connect('drag-end', this._cancel_drag.bind(this));
		this._draggable.connect('drag-cancelled', this._cancel_drag.bind(this));
	}

	_cancel_drag() {
		global.display.emit('restacked');
	}

	acceptDrop(source) {
		// favorite menu item
		if (source.is_babar_favorite) {
			WM.get_workspace_by_index(this.workspace_number).activate(global.get_current_time());
			AppFavorites.getAppFavorites().getFavorites()[source.fav_index].open_new_window(-1);
		}
		
		// window button
		if (source.is_babar_task && source.workspace_number !== this.workspace_number) {
			source.window.change_workspace_by_index(this.workspace_number, false);
			if (source.window.has_focus()) {
				source.window.activate(global.get_current_time());
			}
			return true;
		}
		
		// dash button
		if (source instanceof Dash.DashIcon) {
			Main.overview.hide();
			WM.get_workspace_by_index(this.workspace_number).activate(global.get_current_time());
			source.app.open_new_window(-1);
			return true;
		}
		
		// app grid button
		if (source instanceof AppDisplay.AppIcon) {
			Main.overview.hide();
			WM.get_workspace_by_index(this.workspace_number).activate(global.get_current_time());
			source.app.open_new_window(-1);
			return true;
		}
		
		return false;
	}
});

export default class BabarExtension extends Extension {
	constructor(metadata) {
		super(metadata);
		extension = this;
		// Register callbacks to be notified about changes
		//HGS Changed to use internal wrapper for MonitorManager.get to work under Gnome 44
		let monitorManager = getMonitorManager();
		this._monitorsChanged = monitorManager.connect('monitors-changed', () => this.set_panel_position());
		this._panelHeightChanged = PanelBox.connect("notify::height", () => this.set_panel_position());
	}

	destroy() {
	//HGS Fix for G44
        let monitorManager = getMonitorManager();
        monitorManager.disconnect(this._monitorsChanged);
        PanelBox.disconnect(this._panelHeightChanged)
    }
	
	// get settings
    _get_settings() {
        this.settings = this.getSettings('org.gnome.shell.extensions.babar');
        
        this.settings_already_changed = false;
		this.settings_changed = this.settings.connect('changed', this._settings_changed.bind(this));
		
		WORKSPACES_RIGHT_CLICK = this.settings.get_boolean('workspaces-right-click');
		RIGHT_CLICK = this.settings.get_boolean('right-click');
		MIDDLE_CLICK = this.settings.get_boolean('middle-click');
		REDUCE_PADDING = this.settings.get_boolean('reduce-padding');
		APP_GRID_ICON_NAME = this.settings.get_string('app-grid-icon-name');
		PLACES_ICON_NAME = this.settings.get_string('places-icon-name');
		FAVORITES_ICON_NAME = this.settings.get_string('favorites-icon-name');
		FALLBACK_ICON_NAME = this.settings.get_string('fallback-icon-name');
		ICON_SIZE = this.settings.get_int('icon-size');
		THUMBNAIL_MAX_SIZE = this.settings.get_int('thumbnail-max-size');
		ROUNDED_WORKSPACES_BUTTONS = this.settings.get_boolean('rounded-workspaces-buttons');
		PLAIN_WORKSPACES_BUTTONS = this.settings.get_boolean('plain-workspaces-buttons');
		FLAT_WORKSPACES_BUTTONS = this.settings.get_boolean('flat-workspaces-buttons');
		TOOLTIP_VERTICAL_PADDING = this.settings.get_int('tooltip-vertical-padding');
		HIDDEN_OPACITY = this.settings.get_int('hidden-opacity');
		UNFOCUSED_OPACITY = this.settings.get_int('unfocused-opacity');
		FOCUSED_OPACITY = this.settings.get_int('focused-opacity');
		DESATURATE_ICONS = this.settings.get_boolean('desaturate-icons');
		BOTTOM_PANEL = this.settings.get_boolean('bottom-panel');
		FAVORITES_FIRST = this.settings.get_boolean('favorites-first');
		POSITION_SORT = this.settings.get_boolean('position-sort');
		DISPLAY_ACTIVITIES = this.settings.get_boolean('display-activities');
		DISPLAY_APP_GRID = this.settings.get_boolean('display-app-grid');
		DISPLAY_PLACES_ICON = this.settings.get_boolean('display-places-icon');
		DISPLAY_FAVORITES = this.settings.get_boolean('display-favorites');
		DISPLAY_WORKSPACES = this.settings.get_boolean('display-workspaces');
		DISPLAY_TASKS = this.settings.get_boolean('display-tasks');
		TASKS_POSITION = this.settings.get_boolean('tasks-position');
		DISPLAY_APP_MENU = this.settings.get_boolean('display-app-menu');
		DISPLAY_DASH = this.settings.get_boolean('display-dash');
		DISPLAY_WORKSPACES_THUMBNAILS = this.settings.get_boolean('display-workspaces-thumbnails');
		MIN_TASKS_PER_WORKSPACE = this.settings.get_int('min-tasks-per-workspace');
		ALL_WORKSPACES_LABEL = this.settings.get_string('all-workspaces-label');
    }
    
    // restart extension after settings changed
    _settings_changed() {
    	extension.disable();
    	extension.enable();
    	/*if (!this.settings_already_changed) {
    		Main.notify("Please restart BaBar extension to apply changes.");
    		this.settings_already_changed = true;

    	}*/
    }    
    
    // toggle Activities button
	_show_activities(show) {
		this.activities_button = Main.panel.statusArea['activities'];
		if (this.activities_button) {
			if (show && !Main.sessionMode.isLocked) {
				this.activities_button.container.show();
			} else {
				this.activities_button.container.hide();
			}
		}
	}
	
	// toggle Places Status Indicator extension label to folder	
	_show_places_icon(show_icon) {
		this.places_indicator = Main.panel.statusArea['places-menu'];
		if (this.places_indicator) {
			this.places_indicator.remove_child(this.places_indicator.get_first_child());
			if (show_icon) {
				this.places_icon = new St.Icon({icon_name: PLACES_ICON_NAME, style_class: 'system-status-icon'});
				this.places_indicator.add_child(this.places_icon);
			} else {
				this.places_label = new St.Label({text: _('Places'), y_expand: true, y_align: Clutter.ActorAlign.CENTER});
				this.places_indicator.add_child(this.places_label);
			}
		}
	}
	
	// toggle dash in overview
	_show_dash(show) {
		if (show) {
			Main.overview.dash.show();
		} else {
			Main.overview.dash.hide();
		}
	}

	// set panel poistion according to the settings
	set_panel_position() {
		if (BOTTOM_PANEL) {
			let monitor = Main.layoutManager.primaryMonitor;
    		PanelBox.set_position(monitor.x, (monitor.x + monitor.height - PanelBox.height));
		} else {
			this.reset_panel_position()
		}
	}

	// restore panel position to the top
	reset_panel_position() {
		let monitor = Main.layoutManager.primaryMonitor;
        PanelBox.set_position(monitor.x, monitor.y);
	}
	
	// toggle workspaces thumbnails in overview
	_hide_ws_thumbnails() {
		Main.overview._overview._controls._thumbnailsBox.hide();
	}

    enable() {    
		// get settings
    	this._get_settings();

		// adjust panel position to top or bottom edge of the screen
    	this.set_panel_position();

		// top panel left box padding
    	if (REDUCE_PADDING) {
    		Main.panel._leftBox.add_style_class_name('leftbox-reduced-padding');
    	}
    
    	// Activities button
    	if (!DISPLAY_ACTIVITIES) {
    		this._show_activities(false);
    	}
    	
    	// app grid
		if (DISPLAY_APP_GRID) {
			this.app_grid = new AppGridButton();
			Main.panel.addToStatusArea('babar-app-grid-button', this.app_grid, 0, 'left');
		}
		
		// Places label to icon
		if (DISPLAY_PLACES_ICON) {
			this._show_places_icon(true);
			this.extensions_changed = Main.extensionManager.connect('extension-state-changed', () => this._show_places_icon(true));
		}
		
		// favorites
		if (DISPLAY_FAVORITES) {
			this.favorites_menu = new FavoritesMenu();
			Main.panel.addToStatusArea('babar-favorites-menu', this.favorites_menu, 3, 'left');
		}
		
		// tasks
		if (DISPLAY_TASKS) {
			this.workspaces_bar = new WorkspacesBar();
			Main.panel.addToStatusArea('babar-workspaces-bar', this.workspaces_bar, 5, 'left');
		}
		this._window_context_menu = false;
		
		// dash
		if (!DISPLAY_DASH) {
			this._show_dash(false);
		}
		
		// workspaces thumbnails
		if (!DISPLAY_WORKSPACES_THUMBNAILS) {
			this.showing_overview = Main.overview.connect('showing', this._hide_ws_thumbnails.bind(this));
		}
    }

    disable() {
		// app grid
    	if (DISPLAY_APP_GRID && this.app_grid) {
    		this.app_grid._destroy();
    	}
    	
    	// favorites
    	if (DISPLAY_FAVORITES && this.favorites_menu) {
    		this.favorites_menu._destroy();
    	}
    	
    	// workspaces bar
    	if (DISPLAY_TASKS && this.workspaces_bar) {
    		this.workspaces_bar._destroy();
    	}

		// window context menu
		if (this._window_context_menu) {
			this._window_context_menu.destroy();
		}
    	
    	// top panel left box padding
    	if (REDUCE_PADDING) {
    		Main.panel._leftBox.remove_style_class_name('leftbox-reduced-padding');
    	}

    	// restore panel position
    	this.reset_panel_position();
    	
    	// Places label and unwatch extensions changes
    	if (DISPLAY_PLACES_ICON && this.places_indicator) {
    		this._show_places_icon(false);
    		Main.extensionManager.disconnect(this.extensions_changed);
    	}
    	
    	// Activities button
    	this._show_activities(true);
    	
		
		// dash
		this._show_dash(true);
		
		// workspaces thumbnails
		if (!DISPLAY_WORKSPACES_THUMBNAILS && this.showing_overview) {
			Main.overview.disconnect(this.showing_overview);
		}
		
		// unwatch settings
		this.settings.disconnect(this.settings_changed);
    }
}

//HGS Added to circumvent Meta.MonitorManager
// Provide internal wrapper for MonitorManager.get to work under Gnome 44
// Copied from https://github.com/micheleg/dash-to-dock/commit/ec2ba66febd2195b7ae1cd25b413b6da2a17f6a8
function getMonitorManager() {
    if (global.backend.get_monitor_manager !== undefined)
        return global.backend.get_monitor_manager();
    else
        return Meta.MonitorManager.get();
}


// Copied from https://github.com/tbranyen/gnome-shell-extension-undecorate
function activeWindowId(window) {
    try {
        return parseInt(window.get_description(), 16);
    } catch(e) {
        log(e);
        return;
    }
}

function undecorate(window) {
    try {
        GLib.spawn_command_line_sync('xprop -id ' + activeWindowId(window)
            + ' -f _MOTIF_WM_HINTS 32c -set'
            + ' _MOTIF_WM_HINTS "0x2, 0x0, 0x0, 0x0, 0x0"');
    } catch(e) {
        log(e);
    }
}

function decorate(window) {
    try {
        GLib.spawn_command_line_sync('xprop -id ' + activeWindowId(window)
            + ' -f _MOTIF_WM_HINTS 32c -set'
            + ' _MOTIF_WM_HINTS "0x2, 0x0, 0x1, 0x0, 0x0"');
    } catch(e) {
        log(e);
    }
}