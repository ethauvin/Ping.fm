var MainStageName = 'main';

function AppAssistant(appController)
{
}

AppAssistant.prototype.handleLaunch = function(launchParams)
{
    var stageProxy = this.controller.getStageProxy(MainStageName);
    var stageController = this.controller.getStageController(MainStageName);
    
    if (stageProxy) 
    {
        if (stageController) 
        {
            stageController.window.focus();
        }
    }
    else 
    {
        var pushMainScene = function(stageController)
        {
            stageController.pushScene(MainStageName, launchParams);
        };
        
        var stageArguments = 
            {
                name: MainStageName,
                lightweight: true
            };
        
        this.controller.createStageWithCallback(stageArguments, pushMainScene, 'card');
    }
};
