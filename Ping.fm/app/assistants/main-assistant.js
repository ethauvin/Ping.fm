// ---------------------------------------------------------------------------
// KeyDialogAssistant
// ---------------------------------------------------------------------------
function KeyDialogAssistant(sceneAssistant, focusField)
{
    this.sceneAssistant = sceneAssistant;
    this.focusField = focusField;
}

KeyDialogAssistant.prototype.setup = function(widget)
{
    this.widget = widget;
    
    this.sceneAssistant.controller.setupWidget('mobileKey', 
        {
            hintText: 'Enter your Ping.fm mobile key...',
            autoFocus: true,
            limitResize: true,
            autoReplace: false,
            textCase: Mojo.Widget.steModeLowerCase,
            focusMode: Mojo.Widget.focusAppendMode,
            maxLength: 4
        }, this.mobileKeyModel = 
        {
            value: '',
            disabled: false
        });
    
    this.okButtonModel = 
        {
            label: 'OK',
            disabled: false
        };
    
    this.sceneAssistant.controller.setupWidget('okButton', 
        {
            type: Mojo.Widget.activityButton
        }, this.okButtonModel);
    
    this.okButton = this.sceneAssistant.controller.get('okButton');
    
    this.checkKeyHandler = this.checkKey.bindAsEventListener(this);
    this.sceneAssistant.controller.listen('okButton', Mojo.Event.tap, this.checkKeyHandler);
    
    this.handleKeyHandler = this.handleKeyEvent.bindAsEventListener(this);
    this.sceneAssistant.controller.document.addEventListener('keyup', this.handleKeyHandler, true);
    
    this.cancelButtonModel = 
        {
            label: 'Cancel',
            disabled: false
        };
    
    this.sceneAssistant.controller.setupWidget('cancelButton', 
        {
            type: Mojo.Widget.defaultButton
        }, this.cancelButtonModel);
    
    this.sceneAssistant.controller.listen('cancelButton', Mojo.Event.tap, this.widget.mojo.close);
};

KeyDialogAssistant.prototype.checkKey = function()
{
    this.okButton.mojo.activate();
    this.okButtonModel.label = 'Validating Key';
    this.okButtonModel.disabled = true;
    this.sceneAssistant.controller.modelChanged(this.okButtonModel);
    
    var params = new Hash(
        {
            'api_key': this.sceneAssistant.api_key,
            'mobile_key': this.mobileKeyModel.value
        });
    
    Mojo.Log.info('checkKey: ' + params.toQueryString());
    
    var request = new Ajax.Request('http://api.ping.fm/v1/user.key', 
        {
            method: 'post',
            parameters: params,
            evalJSON: 'false',
            onSuccess: this.checkKeySuccess.bind(this),
            onFailure: this.checkKeyFailure.bind(this)
        });
};

KeyDialogAssistant.prototype.checkKeySuccess = function(transport)
{
    if (transport.responseXML === null) 
    {
        Mojo.Controller.errorDialog("Invalid response from the Ping.fm API.", this.controller.window);
    }
    else 
    {
        var rsp = transport.responseXML.getElementsByTagName('rsp');
        var status = rsp[0].getAttribute('status');
        
        if (status == 'FAIL') 
        {
            this.sceneAssistant.controller.get('keyDialogTitle').update('Invalid or Expired Key. Please Retry.');
            this.mobileKeyModel.value = '';
            this.sceneAssistant.controller.modelChanged(this.mobileKeyModel);
            this.sceneAssistant.controller.get('mobileKey').mojo.focus();
            
            Mojo.Log.info(transport.responseText);
            
            this.okButton.mojo.deactivate();
            this.okButtonModel.label = 'OK';
            this.okButtonModel.disabled = false;
            this.sceneAssistant.controller.modelChanged(this.okButtonModel);
        }
        else 
        {
            this.sceneAssistant.prefs.user_app_key = rsp[0].getElementsByTagName('key').item(0).textContent;
            this.sceneAssistant.updateMethods();
            
            this.okButton.mojo.deactivate();
            this.widget.mojo.close();
        }
    }
};

KeyDialogAssistant.prototype.checkKeyFailure = function(transport)
{
    this.sceneAssistant.transportFailure('checkKeyFailure', transport);
};

KeyDialogAssistant.prototype.handleKeyEvent = function(event)
{
    if (Mojo.Char.isEnterKey(event.keyCode)) 
    {
        if (event.srcElement.parentElement.id == 'mobileKey') 
        {
            this.checkKey();
        }
    }
};

KeyDialogAssistant.prototype.cleanup = function()
{
    this.sceneAssistant.controller.stopListening('okButton', Mojo.Event.tap, this.checkKeyHandler);
    this.sceneAssistant.controller.stopListening('cancelButton', Mojo.Event.tap, this.widget.mojo.close);
    this.sceneAssistant.controller.document.removeEventListener('keyup', this.handleKeyHandler, false);
    
    this.focusField.mojo.focus();
};

KeyDialogAssistant.prototype.activate = function(event)
{
    this.sceneAssistant.controller.get('mobileKey').mojo.focus();
};

// ---------------------------------------------------------------------------
// MainAssistant
// ---------------------------------------------------------------------------
function MainAssistant()
{
}

MainAssistant.prototype.setup = function()
{
    //$$('body')[0].addClassName('palm-dark');
    
    this.hasConnectivity = false;
    this.checkConnectivity();
    
    this.debug = 0;
    
    this.cookieData = new Mojo.Model.Cookie('netThauvinErikWebOsPingFm');
    this.prefs = this.cookieData.get();
    
    //this.api_key = 'edb93979c2abd58781f72d96f042e3a4';
	this.api_key = 'e67b1c8c335bfc67cbd729d7a4535092';
    this.messageMaxLen = 140;
    
    this.defaultMethods = [
        {
            label: 'Default',
            value: 'default'
        }, 
        {
            label: 'Micro-blogs',
            value: 'microblog'
        }, 
        {
            label: 'Statuses',
            value: 'status'
        }, 
        {
            label: 'Blogs',
            value: 'blog'
        }];
    
    if (!this.prefs) 
    {
        this.prefs = 
            {
                version: 1,
                user_app_key: null,
                showTitle: false,
                defaultMethod: this.defaultMethods[0].value,
                methods: this.defaultMethods.clone()
            };
        
        this.cookieData.put(this.prefs);
    }
    
    var hasNoMethods = (this.defaultMethods.length == this.prefs.methods.length);
    
    this.updatedMethods = 
        {
            hasNoServices: hasNoMethods,
            hasNoTargets: hasNoMethods
        };
    
    this.showTitleMenuItem = 
        {
            label: '',
            command: 'do-title'
        };
    this.toggleTitleMenu();
    
    this.appMenuModel = 
        {
            visible: true,
            items: [
                {
                    label: 'About #{title}...'.interpolate(
                        {
                            title: Mojo.Controller.appInfo.title
                        }),
                    command: 'do-about'
                }, Mojo.Menu.editItem, this.showTitleMenuItem, 
                {
                    label: 'Refresh Methods',
                    command: 'do-methods-refresh'
                }, 
                {
                    label: 'Reset Key...',
                    command: 'do-key-reset'
                }]
        };
    
    this.controller.setupWidget(Mojo.Menu.appMenu, 
        {
            omitDefaultItems: true
        }, this.appMenuModel);
    
    this.controller.setupWidget('methodList', 
        {
            label: 'Method'
        }, this.methodModel = 
        {
            choices: this.prefs.methods,
            value: this.prefs.defaultMethod
        
        });
    
    this.controller.setupWidget('titleField', 
        {
            hintText: 'Type a title...',
            focusMode: Mojo.Widget.focusAppendMode,
            hide: true
        }, this.titleModel = 
        {
            value: ''
        });
    
    this.controller.setupWidget('messageField', 
        {
            hintText: 'Type your message...',
            multiline: true,
            changeOnKeyPress: true,
            focusMode: Mojo.Widget.focusAppendMode
        }, this.messageModel = 
        {
            value: ''
        });
    
    this.pingButton = this.controller.get('pingBtn');
    this.pingBtnModel = 
        {
            label: 'Ping It!',
            original: 'Ping It!',
            disabled: true
        };
    this.controller.setupWidget('pingBtn', 
        {
            type: Mojo.Widget.activityButton
        }, this.pingBtnModel);
    
    this.handleKeyHandler = this.handleKeyEvent.bindAsEventListener(this);
    this.controller.listen('messageField', Mojo.Event.propertyChange, this.handleKeyHandler);
    
    this.pingItHandler = this.pingIt.bindAsEventListener(this);
    this.controller.listen('pingBtn', Mojo.Event.tap, this.pingItHandler);
    
    this.activateWindowHandler = this.activateWindow.bindAsEventListener(this);
    this.controller.listen(this.controller.stageController.document, Mojo.Event.activate, this.activateWindowHandler);
};

MainAssistant.prototype.activateWindow = function()
{
    this.askForKey();
};

MainAssistant.prototype.toggleTitleMenu = function()
{
    if (!this.prefs.showTitle) 
    {
        this.controller.get('titleRow').hide();
        this.focusField = this.controller.get('messageField');
        this.showTitleMenuItem.label = 'Show Title';
    }
    else 
    {
        this.controller.get('titleRow').show();
        this.focusField = this.controller.get('titleField');
        this.showTitleMenuItem.label = 'Hide Title';
    }
};

MainAssistant.prototype.togglePingButton = function()
{
    Mojo.Log.info("togglePingButton");
    
    if (this.hasConnectivity) 
    {
        this.pingBtnModel.disabled = (this.messageModel.value.length == 0);
    }
    else 
    {
        this.pingBtnModel.disabled = true;
    }
    
    this.controller.modelChanged(this.pingBtnModel);
};

MainAssistant.prototype.activate = function(event)
{
    //this.askForKey();
};

MainAssistant.prototype.deactivate = function(event)
{
    this.cookieData.put(this.prefs);
    //this.cookieData.remove();
};

MainAssistant.prototype.cleanup = function()
{
    this.controller.stopListening('pingBtn', Mojo.Event.tap, this.pingItHandler);
    this.controller.stopListening('messageField', Mojo.Event.propertyChange, this.handleKeyHandler);
    this.controller.stopListening(this.controller.stageController.document, Mojo.Event.activate, this.activateWindowHandler);
};


MainAssistant.prototype.handleCommand = function(event)
{
    if (event.type == Mojo.Event.command) 
    {
        switch (event.command)
        {
            case 'do-about':
                var currentScene = this.controller.stageController.activeScene();
                currentScene.showAlertDialog(
                    {
                        allowHTMLMessage: true,
                        onChoose: function(value)
                        {
                        },
                        message: '<big><b>#{title} v#{version}</b></big><br/>&copy; 2010, <a href="http://mobile.thauvin.net/">Erik C. Thauvin</a><br/><br/><small>This application uses the Ping.fm API but is not endorsed or certified by <a href="http://ping.fm/">Ping.fm</a></small>'.interpolate(
                            {
                                title: Mojo.Controller.appInfo.title,
                                version: Mojo.Controller.appInfo.version
                            }),
                        choices: [
                            {
                                label: 'OK',
                                value: ''
                            }]
                    });
                break;
                
            case 'do-title':
                this.prefs.showTitle = !this.prefs.showTitle;
                this.toggleTitleMenu();
                
                this.focusField.mojo.focus();
                
                break;
                
            case 'do-methods-refresh':
                this.resetMethods();
                this.updateMethods();
                
                this.focusField.mojo.focus();
                break;
                
            case 'do-key-reset':
                this.resetMethods();
                this.prefs.user_app_key = null;
                
                this.askForKey();
                break;
                
            default:
                break;
                
        }
    }
};

MainAssistant.prototype.handleKeyEvent = function(event)
{
    var len = this.messageMaxLen - this.messageModel.value.length;
    
    if (len < 0) 
    {
        this.controller.get('cntLabel').update('<font color="red">' + len + '</font>');
    }
    else 
    {
        this.controller.get('cntLabel').update(len);
    }
    
    this.togglePingButton();
};

MainAssistant.prototype.askForKey = function(event)
{
    if (this.prefs.user_app_key === null) 
    {
        this.controller.showDialog(
            {
                template: 'main/key-dialog',
                assistant: new KeyDialogAssistant(this, this.focusField)
            });
    }
};

MainAssistant.prototype.pingIt = function()
{
    var message = this.messageModel.value;
    
    if (this.prefs.user_app_key === null) 
    {
        this.pingButton.mojo.deactivate();
        this.askForKey();
    }
    else if (message.length > 0) 
    {
        this.pingBtnModel.label = 'Posting...';
        this.pingBtnModel.disabled = true;
        this.controller.modelChanged(this.pingBtnModel);
        
        var method = this.methodModel.value;
        var url = 'http://api.ping.fm/v1/user.post';
        
        this.prefs.defaultMethod = method;
        
        var params = new Hash(
            {
                'api_key': this.api_key,
                'user_app_key': this.prefs.user_app_key,
                'body': Base64.encode(message),
                'encoding': 'base64',
                'debug': this.debug
            });
        
        if (method.charAt(0) == '#') 
        {
            url = 'http://api.ping.fm/v1/user.tpost';
            params.set('trigger', method.substring(1));
        }
        else if (method.charAt(0) == '@') 
        {
            params.set('service', method.substring(1));
            params.set('post_method', 'default');
        }
        else 
        {
            params.set('post_method', method);
        }
        
        var title = this.titleModel.value;
        if (title != '') 
        {
            params.set('title', Base64.encode(title));
        }
        
        Mojo.Log.info('pingIt: ' + params.toQueryString());
        
        var request = new Ajax.Request(url, 
            {
                method: 'post',
                parameters: params,
                evalJSON: 'false',
                onSuccess: this.pingItSuccess.bind(this),
                onFailure: this.pingItFailure.bind(this)
            });
    }
    else 
    {
        this.focusField.mojo.focus();
        this.pingButton.mojo.deactivate();
    }
};

MainAssistant.prototype.pingItSuccess = function(transport)
{
    this.pingButton.mojo.deactivate();
    this.pingBtnModel.label = this.pingBtnModel.original;
    
    if (transport.responseXML === null) 
    {
        Mojo.Log.warn("pingItSuccess failure.");
        Mojo.Controller.errorDialog("Invalid response from the Ping.fm API.", this.controller.window);
        
        this.pingBtnModel.disabled = false;
    }
    else 
    {
        var rsp = transport.responseXML.getElementsByTagName('rsp');
        var status = rsp[0].getAttribute('status');
        
        if (status == 'FAIL') 
        {
            Mojo.Log.warn(transport.responseText);
            Mojo.Controller.errorDialog(rsp[0].getElementsByTagName('message').item(0).textContent, this.controller.window);
            this.pingBtnModel.disabled = false;
        }
        else 
        {
            this.messageModel.value = '';
            this.titleModel.value = '';
            this.controller.modelChanged(this.messageModel);
            this.controller.modelChanged(this.titleModel);
            this.controller.get('cntLabel').update(this.messageMaxLen);
            this.pingBtnModel.disabled = true;
            
            Mojo.Controller.getAppController().showBanner('Your message has been posted.', {});
        }
    }
    
    this.controller.modelChanged(this.pingBtnModel);
    this.focusField.mojo.focus();
    
};

MainAssistant.prototype.pingItFailure = function(transport)
{
    this.pingButton.mojo.deactivate();
    this.pingBtnModel.label = this.pingBtnModel.original;
    this.pingBtnModel.disabled = false;
    this.controller.modelChanged(this.pingBtnModel);
    
    this.transportFailure('pingItFailure', transport);
};

MainAssistant.prototype.resetMethods = function()
{
    this.updatedMethods.hasNoServices = true;
    this.updatedMethods.hasNoTargets = true;
    
    this.prefs.methods.clear();
    for (var i = 0; i < this.defaultMethods.length; i++) 
    {
        this.prefs.methods.push(this.defaultMethods[i]);
    }
    this.prefs.defaultMethod = this.defaultMethods[0].value;
    
    this.methodModel.value = this.prefs.defaultMethod;
    this.controller.modelChanged(this.methodModel);
};

MainAssistant.prototype.updateMethods = function()
{
    if (this.prefs.user_app_key && this.hasConnectivity) 
    {
        var request;
        
        if (this.updatedMethods.hasNoServices) 
        {
            request = new Ajax.Request('http://api.ping.fm/v1/user.services', 
                {
                    method: 'post',
                    parameters: 
                        {
                            'api_key': this.api_key,
                            'user_app_key': this.prefs.user_app_key
                        },
                    evalJSON: 'false',
                    onSuccess: this.updateMethodsSuccess.bind(this),
                    onFailure: this.updateMethodsFailure.bind(this)
                });
        }
        
        if (this.updatedMethods.hasNoTargets) 
        {
            request = new Ajax.Request('http://api.ping.fm/v1/user.triggers', 
                {
                    method: 'post',
                    parameters: 
                        {
                            'api_key': this.api_key,
                            'user_app_key': this.prefs.user_app_key
                        },
                    evalJSON: 'false',
                    onSuccess: this.updateTriggersSuccess.bind(this),
                    onFailure: this.updateTriggersFailure.bind(this)
                });
        }
    }
};

MainAssistant.prototype.updateMethodsSuccess = function(transport)
{
    if (transport.responseXML === null) 
    {
        Mojo.Log.warn("updateMethodsSuccess failure.");
        this.updateMethods();
    }
    else 
    {
        this.updateMethods.hasNoServices = false;
        
        var services = transport.responseXML.getElementsByTagName('service');
        for (var i = 0; i < services.length; i++) 
        {
            var id = '@' + services[i].getAttribute('id');
            var name = services[i].getAttribute('name');
            var trigger = services[i].getElementsByTagName('trigger').item(0).textContent;
            
            this.prefs.methods.push(
                {
                    label: name + ' (' + trigger + ')',
                    value: id
                });
            
            if (this.prefs.defaultMethod == id) 
            {
                this.methodModel.value = id;
                this.controller.modelChanged(this.methodModel);
            }
        }
        
        Mojo.Controller.getAppController().showBanner('Methods successfully updated.', {});
    }
};


MainAssistant.prototype.updateMethodsFailure = function(transport)
{
    this.transportFailure('updateMethodFailure', transport);
};

MainAssistant.prototype.updateTriggersSuccess = function(transport)
{
    if (transport.responseXML === null) 
    {
        Mojo.Log.warn("updateTriggersSuccess failure.");
        this.updateMethods();
    }
    else 
    {
        this.updateMethods.hasNoTargets = false;
        
        var triggers = transport.responseXML.getElementsByTagName('trigger');
        
        for (var i = 0; i < triggers.length; i++) 
        {
            var id = '#' + triggers[i].getAttribute('id');
            //var method = triggers[i].getAttribute('method');
            
            this.prefs.methods.unshift(
                {
                    label: id,
                    value: id
                });
            
            if (this.prefs.defaultMethod == id) 
            {
                this.methodModel.value = id;
                this.controller.modelChanged(this.methodModel);
            }
        }
    }
};

MainAssistant.prototype.updateTriggersFailure = function(transport)
{
    this.transportFailure('updateTriggersFailure', transport);
};


MainAssistant.prototype.handleConnectivity = function(status)
{
    if (status.isInternetConnectionAvailable === true) 
    {
        this.hasConnectivity = true;
    }
    else 
    {
        this.hasConnectivity = false;
        Mojo.Controller.getAppController().showBanner('No connectivity to the Internet.', {});
    }
    
    this.togglePingButton();
};

MainAssistant.prototype.checkConnectivity = function()
{
    this.controller.serviceRequest('palm://com.palm.connectionmanager', 
        {
            method: 'getstatus',
            parameters: 
                {
                    subscribe: true
                },
            onSuccess: this.handleConnectivity.bind(this)
        });
};

MainAssistant.prototype.transportFailure = function(caller, transport)
{
    Mojo.Log.error(caller + ': ' + transport.responseText);
    Mojo.Controller.errorDialog('Error status #{status} returned from Ping.fm API request.'.interpolate(
        {
            status: transport.status
        }), this.controller.window);
};

