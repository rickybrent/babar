// Preferences UI for BaBar GNOME Shell extension

import Adw from "gi://Adw"
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BabarPrefs extends ExtensionPreferences {

	make_item(label, schema, type, min, max) {
		this.item_label = new Gtk.Label({
			label: label,
			margin_start: 14,
			halign: Gtk.Align.START,
			visible: true
		});
		let grid = new Gtk.Grid({
			visible: true,
			margin_start: 18,
			margin_end: 18,
			margin_top: 2,
			margin_bottom: 2,
			column_spacing: 96
		});
		grid.attach(this.item_label, 0, 0, 1, 1);

		if (type == 'b') {
			this.item_value = new Gtk.Switch({
				active: this.settings.get_boolean(schema),
				halign: Gtk.Align.END,
				hexpand: true,
				visible: true
			});

			grid.attach(this.item_value, 1, 0, 1, 1);

			this.settings.bind(
				schema,
				this.item_value,
				'active',
				Gio.SettingsBindFlags.DEFAULT
			);
		}

		if (type == 'i') {
			this.item_adjustment = new Gtk.Adjustment({
				lower: min,
				upper: max,
				step_increment: 1
			});
			this.item_value = new Gtk.SpinButton({
				adjustment: this.item_adjustment,
				value: this.settings.get_int(schema),
				halign: Gtk.Align.END,
				hexpand: true,
				visible: true
			});

			grid.attach(this.item_value, 1, 0, 1, 1);

			this.settings.bind(
				schema,
				this.item_value,
				'value',
				Gio.SettingsBindFlags.DEFAULT
			);
		}

		if (type == 's') {
			this.item_value = new Gtk.Entry({
				text: this.settings.get_string(schema),
				halign: Gtk.Align.END,
				hexpand: true,
				visible: true
			});

			grid.attach(this.item_value, 1, 0, 1, 1);

			this.settings.bind(
				schema,
				this.item_value,
				'text',
				Gio.SettingsBindFlags.DEFAULT
			);
		}
		this.list['append'](grid);
	}

	make_section_title(title) {
		this.section_title = new Gtk.Label({
			label: '<b>' + title + '</b>',
			halign: Gtk.Align.START,
			use_markup: true,
			margin_start: 8,
			margin_top: 2,
			margin_bottom: 2,
			visible: true,
		});
		this.list['append'](this.section_title);

	}

	fillPreferencesWindow(win) {
		win.set_default_size(1000, 800);
		this.settings = this.getSettings();

		this.prefsWidget = new Gtk.ScrolledWindow({
			visible: true,
			margin_start: 18,
			margin_end: 18,
			margin_top: 18,
			margin_bottom: 18,
			vexpand: true,
			hscrollbar_policy: Gtk.PolicyType.NEVER,
			vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
			overlay_scrolling: false
		});

		this.list = new Gtk.ListBox({
			selection_mode: null,
			can_focus: false,
			visible: true
		});
		this.prefsWidget.set_child(this.list);
		this.prefsWidget.activatable_widget = this.list;

		// items
		this.make_section_title('Elements (default value)');

		this.make_item('Activities (false)', 'display-activities', 'b');
		this.make_item('Applications grid (true)', 'display-app-grid', 'b');
		this.make_item('Favorites menu (true)', 'display-favorites', 'b');
		this.make_item('Workspaces (true)', 'display-workspaces', 'b');
		this.make_item('Tasks (true)', 'display-tasks', 'b');
		this.make_item('Application menu (false)', 'display-app-menu', 'b');
		this.make_item('Dash in overview (true)', 'display-dash', 'b');
		this.make_item('Workspaces thumbnails in overview (true)', 'display-workspaces-thumbnails', 'b');

		this.make_section_title('Appearance (default value)');

		this.make_item('Reduce elements padding (true)', 'reduce-padding', 'b');
		this.make_item('Places extension label to icon (true)', 'display-places-icon', 'b');
		this.make_item('Rounded workspaces icons (false)', 'rounded-workspaces-buttons', 'b');
		this.make_item('Plain workspaces icons (false)', 'plain-workspaces-buttons', 'b');
		this.make_item('Flat workspaces icons (false)', 'flat-workspaces-buttons', 'b');
		this.make_item('Remove color from tasks icons (false)', 'desaturate-icons', 'b');
		this.make_item('Move panel to the bottom of the screen (false)', 'bottom-panel', 'b');
		this.make_item('Task icon size (18: Shell <= 3.38, 20: Shell >= 40)', 'icon-size', 'i', 8, 64);
		this.make_item('Thumbnail maximum size % (25)', 'thumbnail-max-size', 'i', 10, 100);
		this.make_item('Applications grid icon (view-app-grid-symbolic)', 'app-grid-icon-name', 's');
		this.make_item('Places icon (folder-symbolic)', 'places-icon-name', 's');
		this.make_item('Favorites icon (starred-symbolic)', 'favorites-icon-name', 's');
		this.make_item('All workspaces label', 'all-workspaces-label', 's');

		this.make_section_title('Behavior (default value)');

		this.make_item('Workspaces: left click to show, right-click to show or toggle overview (false)', 'workspaces-right-click', 'b');
		this.make_item('Workspaces: min tasks per workspace', 'min-tasks-per-workspace', 'i', 0, 20);
		this.make_item('Tasks: right-click to show window thumbnail (true)', 'right-click', 'b');
		this.make_item('Tasks: middle-click to close window (true)', 'middle-click', 'b');
		this.make_item('Tasks: sort favorites first (false)', 'favorites-first', 'b');
		this.make_item('Tasks: sort based on window positions on screen first (false)', 'position-sort', 'b');
		this.make_item('Tasks: position', 'tasks-position', 'b');


		// fill window
		const page = new Adw.PreferencesPage();
		const group = new Adw.PreferencesGroup();
		const bin = new Adw.Bin();
		bin.set_child(this.prefsWidget);
		group.add(bin);
		page.add(group);
		win.add(page);
	}
}
