require([
	'goo/entities/GooRunner',
	'goo/entities/SystemBus',
	'goo/fsmpack/statemachine/StateMachineSystem',
	'goo/entities/systems/HtmlSystem',
	'goo/timelinepack/TimelineSystem',
	'goo/loaders/DynamicLoader',
	'goo/util/combine/EntityCombiner',
	'goo/renderer/Renderer',
	'goo/util/rsvp',

	'js/CanvasWrapper',
	'js/checkBrowser',

	'goo/fsmpack/StateMachineComponentHandler',
	'goo/fsmpack/MachineHandler',
	'goo/timelinepack/TimelineComponentHandler',
	'goo/quadpack/QuadComponentHandler'
], function (
	GooRunner,
	SystemBus,
	StateMachineSystem,
	HtmlSystem,
	TimelineSystem,
	DynamicLoader,
	EntityCombiner,
	Renderer,
	RSVP,

	CanvasWrapper,
	checkBrowser
) {
	'use strict';

	function setup(gooRunner, loader) {
		var goonEntity = gooRunner.world.by.name('Goon').first();
		var crateEntities = gooRunner.world.by.name('Crate').toArray();
		var platformEntities = gooRunner.world.by.name('Platform').toArray();
		var groundEntity = gooRunner.world.by.name('Ground').first();
		var carEntity = gooRunner.world.by.name('Car').first();
		var starEntity = gooRunner.world.by.name('Star').first();

		var platformPositions = [[2,0],[0,1],[-2,2]];
		var jumpSpeed=6, walkSpeed=2, motorSpeed=20, world, characterBody, planeBody, platforms=[], boxes=[];

		var buttons = {
			space : false,
			left :  false,
			right : false,
			f: false,
		};

		// Init world
		world = new p2.World();

		world.defaultContactMaterial.friction = 1;
		world.setGlobalStiffness(1e5);

		// Init materials
		var groundMaterial = new p2.Material(),
			characterMaterial = new p2.Material(),
			boxMaterial = new p2.Material(),
			starMaterial = new p2.Material();

		// Add a character body
		var characterShape = new p2.Rectangle(0.5,1);
		characterBody = new p2.Body({
			mass: 1,
			position:[0,3],
			fixedRotation: true,
		});
		characterBody.addShape(characterShape);
		world.addBody(characterBody);
		characterShape.material = characterMaterial;
		characterBody.damping = 0.5;

		// Add a ground plane
		var planeShape = new p2.Plane();
		planeBody = new p2.Body({
			position:[0,-1]
		});
		planeBody.addShape(planeShape);
		world.addBody(planeBody);
		planeShape.material = groundMaterial;

		// Add platforms
		var platformShape = new p2.Rectangle(1,0.3);
		for(var i=0; i<platformPositions.length; i++){
			var platformBody = new p2.Body({
				mass: 0, // Static
				position:platformPositions[i],
			});
			platformBody.motionState = p2.Body.KINEMATIC;
			platformBody.addShape(platformShape);
			world.addBody(platformBody);
			platforms.push(platformBody);
		}
		platformShape.material = groundMaterial;



		// Add movable boxes
		var boxPositions = [[2,1],[0,2],[-2,3]],
			boxShape = new p2.Rectangle(0.8,0.8);
		for(var i=0; i<boxPositions.length; i++){
			var boxBody = new p2.Body({
				mass: 1,
				position:boxPositions[i],
			});
			boxBody.addShape(boxShape);
			world.addBody(boxBody);
			boxes.push(boxBody);
		}
		boxShape.material = boxMaterial;



		// Add star
		var starShape = new p2.Rectangle(0.5,0.5);
		var starBody = new p2.Body({
			mass: 1,
			position:[4,1],
		});
		starBody.addShape(starShape);
		world.addBody(starBody);
		starShape.material = starMaterial;



        // Create chassis for our car
        var chassisBody = new p2.Body({
            mass : 1,        // Setting mass > 0 makes it dynamic
            position: [-4,2] // Initial position
        });
        var chassisShape = new p2.Rectangle(1,0.5);                     // Chassis shape is a rectangle
        chassisBody.addShape(chassisShape);
        world.addBody(chassisBody);

        // Create wheels
        var wheelBody1 = new p2.Body({ mass : 1, position:[chassisBody.position[0] - 0.5,0.7] }),
            wheelBody2 = new p2.Body({ mass : 1, position:[chassisBody.position[0] + 0.5,0.7] }),
            wheelShape = new p2.Circle(0.05);
        wheelBody1.addShape(wheelShape);
        wheelBody2.addShape(wheelShape);
        world.addBody(wheelBody1);
        world.addBody(wheelBody2);

        // Constrain wheels to chassis with revolute constraints.
        // Revolutes lets the connected bodies rotate around a shared point.
        var localChassisPivot1 = [-0.5, -0.3];  // Where to hinge first wheel on the chassis
        var localChassisPivot2 = [ 0.5, -0.3];  // Where to hinge second wheel on the chassis
        var localWheelPivot = [0,0];            // Where the hinge is in the wheel (center)
        var revoluteBack = new p2.RevoluteConstraint(chassisBody, localChassisPivot1, wheelBody1, localWheelPivot, {
            collideConnected: false
        });
        var revoluteFront = new p2.RevoluteConstraint(chassisBody, localChassisPivot2, wheelBody2, localWheelPivot, {
            collideConnected: false
        });
        world.addConstraint(revoluteBack);
        world.addConstraint(revoluteFront);

        // Enable the constraint motor for the back wheel
        revoluteBack.enableMotor();
        revoluteBack.setMotorSpeed(motorSpeed); // Rotational speed in radians per second




		// Init contactmaterials
		var groundCharacterCM = new p2.ContactMaterial(groundMaterial, characterMaterial,{
			friction : 0.0, // No friction between character and ground
		});
		var boxCharacterCM = new p2.ContactMaterial(boxMaterial, characterMaterial,{
			friction : 0.0, // No friction between character and boxes
		});
		var boxGroundCM = new p2.ContactMaterial(boxMaterial, groundMaterial,{
			friction : 0.6, // Between boxes and ground
		});
		world.addContactMaterial(groundCharacterCM);
		world.addContactMaterial(boxCharacterCM);
		world.addContactMaterial(boxGroundCM);

		function time(){
			return new Date().getTime() / 1000;
		}

      	var lastCallTime = time();

		// Animation loop
		gooRunner.callbacks.push(function(t){
			var t = gooRunner.world.time;

			if(buttons.f){
				for(var i=0; i<world.bodies.length; i++){
					var force = world.bodies[i].force;
					var position = world.bodies[i].position;
					force[0] = -(position[0]) * 10;
					force[1] = -(position[1] - 4) * 10;
				}
			}

			if(chassisBody.position[0] > 5){
 				revoluteBack.setMotorSpeed(-motorSpeed);
 			} else if(chassisBody.position[0] < -5){
 				revoluteBack.setMotorSpeed(motorSpeed);
 			}

			for(var i=0; i<platforms.length; i++){
				var vx = 0,
					vy = 0;
				switch(i){
					case 0: vx = Math.sin(t*2); break;
					case 2: vy = Math.cos(t); break;
				}
				platforms[i].velocity[0] = vx;
				platforms[i].velocity[1] = vy;
			}

			// Apply button response
			if(buttons.right) characterBody.velocity[0] =  walkSpeed;
			else if(buttons.left)  characterBody.velocity[0] = -walkSpeed;
			else characterBody.velocity[0] = 0;

	        // Compute time since last time we called the .step() method
	        var timeSinceLastCall = time()-lastCallTime;
	        lastCallTime = time();

			// Move physics bodies forward in time
			world.step(1/60/*, timeSinceLastCall, 2*/);

			// Update platforms
			for (var i=0; i<platforms.length; i++) {
				updateTransform(platformEntities[i], platforms[i]);
			}
			for(var i=0; i<boxes.length; i++){
				updateTransform(crateEntities[i], boxes[i]);
			}
			updateTransform(goonEntity, characterBody);
			updateTransform(groundEntity, planeBody);
			updateTransform(carEntity, chassisBody);
			updateTransform(starEntity, starBody);
		});

		world.on('beginContact', function(event){
			if( (event.bodyA === starBody && event.bodyB === characterBody) ||
				(event.bodyB === starBody && event.bodyA === characterBody)){

				// Disable contacts
				for(var i=0; i<event.contactEquations.length; i++){
					event.contactEquations[i].enabled = false;
				}

				// Random spawn
				starBody.position[0] = 10 * (Math.random() - 0.5);
				starBody.position[1] = 6;
				starBody.angle = 0;

				// Reset velocity
				starBody.velocity[0] = starBody.velocity[1] = starBody.angularVelocity = 0;

				SystemBus.emit('goonFire');
			}
		});

	  	var scale = 1;
		function updateTransform(entity, p2Body) {
			if(!entity || !p2Body) return;
			var position = p2Body.position;
			entity.transformComponent.transform.translation.setd(position[0] * scale, position[1] * scale, 0);
			entity.transformComponent.transform.rotation.fromAngles(0,0,p2Body.angle);
			entity.transformComponent.setUpdated();
		}

	  var yAxis = p2.vec2.fromValues(0,1);
	  function checkIfCanJump(){
		var result = false;
		for(var i=0; i<world.narrowphase.contactEquations.length; i++){
		  var c = world.narrowphase.contactEquations[i];
		  if(c.bodyA === characterBody || c.bodyB === characterBody){
			var d = p2.vec2.dot(c.normalA, yAxis); // Normal dot Y-axis
			if(c.bodyA === characterBody) d *= -1;
			if(d > 0.5) result = true;
		  }
		}
		return result;
	  }

	  window.onkeydown = function(event){
		switch(event.keyCode){
		  case 38: // up
		  case 32: // space
			if(!buttons.space){
			  if(checkIfCanJump()) characterBody.velocity[1] = jumpSpeed;
			  buttons.space = true;
			}
			break;
		  case 39: // right
		  	if(!buttons.right){
				buttons.right = true;
				buttons.left = false;
				SystemBus.emit('goonRunRight');
			}
			break;
		  case 37: // left
		  	if(!buttons.left){
				buttons.left = true;
				buttons.right = false;
				SystemBus.emit('goonRunLeft');
			}
			break;
		  case 70: // f
		  	if(!buttons.f){
				buttons.f = true;
			}
			break;
		}
	  }

	  window.onkeyup = function(event){
		switch(event.keyCode){
		  case 38: // up
		  case 32: // space
		  	if(buttons.space){
				buttons.space = false;
			}
			break;
		  case 39: // right
		  	if(buttons.right){
				buttons.right = false;
			}
			break;
		  case 37: // left
		  	if(buttons.left){
				buttons.left = false;
			}
			break;
		  case 70: // f
		  	if(buttons.f){
				buttons.f = false;
			}
			break;
		}

		if(!buttons.left && !buttons.right){
			SystemBus.emit('goonIdle');
		} else if(buttons.left){
			SystemBus.emit('goonRunLeft');
		} else if(buttons.right){
			SystemBus.emit('goonRunRight');
		}
	  }

	}

	function init() {
		// Prevent browser peculiarities to mess with our controls.
		document.body.addEventListener('touchstart', function (event) {
			event.preventDefault();
		}, false);

		// Check that the browser supports webGL
		checkBrowser();

		// Init the GooEngine
		var gooRunner = initGoo();
		var world = gooRunner.world;

		var transformSystem = world.getSystem('TransformSystem');
		var cameraSystem = world.getSystem('CameraSystem');
		var boundingSystem = world.getSystem('BoundingUpdateSystem');
		var renderSystem = world.getSystem('RenderSystem');

		// Load the project
		loadProject(gooRunner).then(function (loader) {
			world.processEntityChanges();
			transformSystem._process();
			cameraSystem._process();
			boundingSystem._process();
			if (Renderer.mainCamera) { gooRunner.renderer.checkResize(Renderer.mainCamera); }
			return setup(gooRunner, loader);
		}).then(function () {
			new EntityCombiner(world).combine();
			world.processEntityChanges();
			transformSystem._process();
			cameraSystem._process();
			boundingSystem._process();
			renderSystem._process();

			var promise = new RSVP.Promise();

			gooRunner.renderer.precompileShaders(renderSystem._activeEntities, renderSystem.lights, function () {
				gooRunner.renderer.preloadMaterials(renderSystem._activeEntities, function () {
					promise.resolve();
				});
			});
			return promise;
		}).then(function () {
			// Hide the loading overlay.
			document.getElementById('loading-overlay').style.display = 'none';
			CanvasWrapper.show();

			CanvasWrapper.resize();
			// Start the rendering loop!
			gooRunner.startGameLoop();
			gooRunner.renderer.domElement.focus();
		}).then(null, function (e) {
			// If something goes wrong, 'e' is the error message from the engine.
			alert('Failed to load project: ' + e);
		});
	}

	function initGoo() {
		// Create typical Goo application.
		var gooRunner = new GooRunner({
			antialias: true,
			manuallyStartGameLoop: true,
			useDevicePixelRatio: true
		});

		gooRunner.world.add(new StateMachineSystem(gooRunner));
		gooRunner.world.add(new HtmlSystem(gooRunner.renderer));
		gooRunner.world.add(new TimelineSystem());

		return gooRunner;
	}


	function loadProject(gooRunner) {
		/**
		 * Callback for the loading screen.
		 *
		 * @param  {number} handled
		 * @param  {number} total
		 */
		var progressCallback = function (handled, total) {
			var loadedPercent = (100 * handled / total).toFixed();
			var loadingOverlay = document.getElementById("loading-overlay");
			var progressBar = document.getElementById("progress-bar");
			var progress = document.getElementById("progress");
			var loadingMessage = document.getElementById("loading-message");

			loadingOverlay.style.display = "block";
			loadingMessage.style.display = "block";
			progressBar.style.display = "block";
			progress.style.width = loadedPercent + "%";
		};

		// The loader takes care of loading the data.
		var loader = new DynamicLoader({
			world: gooRunner.world,
			rootPath: 'res'
		});

		return loader.load('root.bundle', {
			preloadBinaries: true,
			progressCallback: progressCallback
		}).then(function(result) {
			var project = null;

			// Try to get the first project in the bundle.
			for (var key in result) {
				if (/\.project$/.test(key)) {
					project = result[key];
					break;
				}
			}

			if (!project || !project.id) {
				alert('Error: No project in bundle'); // Should never happen.
				return null;
			}

			// Setup the canvas configuration (sizing mode, resolution, aspect
			// ratio, etc).
			var scene = result[project.mainSceneRef];
			var canvasConfig = scene ? scene.canvas : {};
			CanvasWrapper.setup(gooRunner.renderer.domElement, canvasConfig);
			CanvasWrapper.add();
			CanvasWrapper.hide();

			return loader.load(project.id);
		});
	}
	init();
});
