/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./simpleFindWidget';
import * as nls from 'vs/nls';
import { Widget } from 'vs/base/browser/ui/widget';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { registerThemingParticipant, ITheme } from 'vs/platform/theme/common/themeService';
import { inputBackground, inputActiveOptionBorder, inputForeground, inputBorder, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationErrorBackground, inputValidationErrorBorder, editorWidgetBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { HistoryNavigator } from 'vs/base/common/history';
import { SimpleButton } from './findWidget';
import { Delayer } from 'vs/base/common/async';
import { ISimpleFindWidgetService } from 'vs/editor/contrib/find/browser/simpleFindWidgetService';

// We may need to add a ContextKey to track a focused widget (currently commands are executed within the action context)
// ContextKey to track widget with focused input
export const KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_INPUT_FOCUSED = new RawContextKey<boolean>('simpleFindWidgetInputFocused', undefined);

const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next match");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");

export abstract class SimpleFindWidget extends Widget {

	protected _findInput: FindInput;
	protected _domNode: HTMLElement;
	protected _isVisible: boolean;
	protected _focusTracker: dom.IFocusTracker;
	protected _findInputFocusTracker: dom.IFocusTracker;
	protected _findInputFocused: IContextKey<boolean>;
	protected _findHistory: HistoryNavigator<string>;
	protected _updateHistoryDelayer: Delayer<void>;

	constructor(
		@IContextViewService private _contextViewService: IContextViewService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@ISimpleFindWidgetService private _simpleFindWidgetService: ISimpleFindWidgetService,
		private _animate: boolean = true
	) {
		super();
		this._findInput = this._register(new FindInput(null, this._contextViewService, {
			label: NLS_FIND_INPUT_LABEL,
			placeholder: NLS_FIND_INPUT_PLACEHOLDER,
		}));

		// Find History with update delayer
		this._findHistory = new HistoryNavigator<string>();
		this._updateHistoryDelayer = new Delayer<void>(500);

		this._findInputFocused = KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_INPUT_FOCUSED.bindTo(this._contextKeyService);

		this.oninput(this._findInput.domNode, (e) => {
			this.onInputChanged();
			this._delayedUpdateHistory();
		});

		this._register(this._findInput.onKeyDown((e) => {
			if (e.equals(KeyCode.Enter)) {
				this.find(false);
				e.preventDefault();
				return;
			}

			if (e.equals(KeyMod.Shift | KeyCode.Enter)) {
				this.find(true);
				e.preventDefault();
				return;
			}
		}));

		let prevBtn = new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL,
			className: 'previous',
			onTrigger: () => {
				this.find(true);
			},
			onKeyDown: (e) => { }
		});

		let nextBtn = new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL,
			className: 'next',
			onTrigger: () => {
				this.find(false);
			},
			onKeyDown: (e) => { }
		});

		let closeBtn = new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL,
			className: 'close-fw',
			onTrigger: () => {
				this.hide();
			},
			onKeyDown: (e) => { }
		});

		this._domNode = document.createElement('div');
		this._domNode.classList.add('simple-find-part');
		this._domNode.appendChild(this._findInput.domNode);
		this._domNode.appendChild(prevBtn.domNode);
		this._domNode.appendChild(nextBtn.domNode);
		this._domNode.appendChild(closeBtn.domNode);

		this.onkeyup(this._domNode, e => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
				e.preventDefault();
				return;
			}
		});

		this._focusTracker = this._register(dom.trackFocus(this._domNode));
		this._register(this._focusTracker.addFocusListener(this.onFocusTrackerFocus.bind(this)));
		this._register(this._focusTracker.addBlurListener(this.onFocusTrackerBlur.bind(this)));

		this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
		this._register(this._findInputFocusTracker.addFocusListener(this._onFindInputFocusTrackerFocus.bind(this)));
		this._register(this._findInputFocusTracker.addBlurListener(this._onFindInputFocusTrackerBlur.bind(this)));

		this._register(dom.addDisposableListener(this._domNode, 'click', (event) => {
			event.stopPropagation();
		}));
	}

	public abstract find(previous: boolean);
	protected abstract onInputChanged();
	protected abstract onFocusTrackerFocus();
	protected abstract onFocusTrackerBlur();

	private _onFindInputFocusTrackerFocus() {
		this._findInputFocused.set(true);
		this._simpleFindWidgetService.setFocusedSimpleFindWidgetInput(this);
	}

	private _onFindInputFocusTrackerBlur() {
		this._findInputFocused.reset();
		this._simpleFindWidgetService.setFocusedSimpleFindWidgetInput(null);
	}

	protected get inputValue() {
		return this._findInput.getValue();
	}

	protected _delayedUpdateHistory() {
		this._updateHistoryDelayer.trigger(this._updateHistory.bind(this));
	}

	protected _updateHistory() {
		if (this.inputValue) {
			this._findHistory.add(this._findInput.getValue());
		}
	}

	public updateTheme(theme?: ITheme): void {
		let inputStyles = {
			inputActiveOptionBorder: theme.getColor(inputActiveOptionBorder),
			inputBackground: theme.getColor(inputBackground),
			inputForeground: theme.getColor(inputForeground),
			inputBorder: theme.getColor(inputBorder),
			inputValidationInfoBackground: theme.getColor(inputValidationInfoBackground),
			inputValidationInfoBorder: theme.getColor(inputValidationInfoBorder),
			inputValidationWarningBackground: theme.getColor(inputValidationWarningBackground),
			inputValidationWarningBorder: theme.getColor(inputValidationWarningBorder),
			inputValidationErrorBackground: theme.getColor(inputValidationErrorBackground),
			inputValidationErrorBorder: theme.getColor(inputValidationErrorBorder)
		};
		this._findInput.style(inputStyles);
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	// Reveal is used to show widget and optionally focus on input
	public reveal(focusInput: boolean, initialInput?: string): void {
		if (initialInput) {
			this._findInput.setValue(initialInput);
		}

		if (this._isVisible && focusInput) {
			this._findInput.select();
			return;
		}

		this._isVisible = true;

		setTimeout(() => {
			dom.addClass(this._domNode, 'visible');
			this._domNode.setAttribute('aria-hidden', 'false');
			if (!this._animate) {
				dom.addClass(this._domNode, 'noanimation');
			}
			setTimeout(() => {
				dom.removeClass(this._domNode, 'noanimation');
				if (focusInput) {
					this._findInput.select();
				}
			}, 200);
		}, 0);
	}

	public hide(): void {
		if (this._isVisible) {
			this._isVisible = false;

			dom.removeClass(this._domNode, 'visible');
			this._domNode.setAttribute('aria-hidden', 'true');
		}
	}

	public showNextFindTerm() {
		let next = this._findHistory.next();
		if (next) {
			this._findInput.setValue(next);
		}
	}

	public showPreviousFindTerm() {
		let previous = this._findHistory.previous();
		if (previous) {
			this._findInput.setValue(previous);
		}
	}

}

// theming
registerThemingParticipant((theme, collector) => {
	const findWidgetBGColor = theme.getColor(editorWidgetBackground);
	if (findWidgetBGColor) {
		collector.addRule(`.monaco-workbench .simple-find-part { background-color: ${findWidgetBGColor} !important; }`);
	}

	let widgetShadowColor = theme.getColor(widgetShadow);
	if (widgetShadowColor) {
		collector.addRule(`.monaco-workbench .simple-find-part { box-shadow: 0 2px 8px ${widgetShadowColor}; }`);
	}
});