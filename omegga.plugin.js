const { brs } = OMEGGA_UTIL;
const raycasttest = require('./Raycast');
const weplist = require('./Weaponslist');
const speciallist = require('./SpecialBrickSizeTable');	
const fs = require('fs');

const clr = {
red: "<color=\"FF0000\">",
grn: "<color=\"00FF00\">",
ylw: "<color=\"FFFF00\">",
orn: "<color=\"FF9900\">",
dgrn: "<color=\"007700\">",
prpl: "<color=\"8822FF\">",
slv: "<color=\"ddddcc\">",
cyn: "<color=\"33ddff\">",
end: "</>"
}
let shoplist = [
	{weapon: 'micro smg', price: 20},
	{weapon: 'heavy smg', price: 60},
	{weapon: 'barrage launcher', price: 100},
	{weapon: 'suppressed bullpup smg', price: 300},
	{weapon: 'auto shotgun', price: 440},
	{weapon: 'assault rifle', price: 600},
	{weapon: 'sniper', price: 840},
	{weapon: 'service rifle', price: 1100},
	{weapon: 'slug shotgun', price: 1200},
	{weapon: 'impact grenade launcher', price: 1600},
	{weapon: 'classic assault rifle', price: 2100},
	{weapon: 'bazooka', price: 2800},
	{weapon: 'rocket launcher', price: 3800},
	{weapon: 'twin cannon', price: 4600}
];

const moneyfile = fs.readFileSync(__dirname + "/Other/Money.brs");
const moneybrs = brs.read(moneyfile);
const corefile = fs.readFileSync(__dirname + "/Other/Base core.brs");
const corebrs = brs.read(corefile);

let online = [];
let todie = [];
let basecores = [];

let weapons;
let specials;
let delay = 200;
let projrange = 800;
let turretrange = 800;
let spawned = [];
let e = false;
let enablechecker = false;
let time = 10;
let XYBoundry = 38000;
let ZBoundry = 9000;

let totax = [];
let minbrickcount = 5000;

let buildtime = 10;
let fighttime = 10;

let ProjectileCheckInterval;
let CountDownInterval;
let skipnturretinterval;

let machinesbrs = [];
let allowerase = false;
let machines = [];
let mcntimeout = [];

let skipcooldown = 0;
let skiptime = 0;
let wanttoskip = [];
let minplayers = 0;

class Base_wars {
	
	constructor(omegga, config, store) {
		this.omegga = omegga;
		this.config = config;
		this.store = store
		delay = this.config.UpdateFrequency;
		projrange = this.config.DetectionRange;
	}
	async CheckProjectiles(enabled) {
		if(!enabled) { return; }
		// Gets location of the spherecomponent.
		const projectileRegExp = new RegExp(`SphereComponent .+?RelativeLocation = \\(X=(?<x>[\\d\\.-]+),Y=(?<y>[\\d\\.-]+),Z=(?<z>[\\d\\.-]+)\\)`);
		const projectiles = await this.omegga.addWatcher(projectileRegExp, {
			exec: () =>
			this.omegga.writeln(
				`GetAll SphereComponent RelativeLocation`
			),
			timeoutDelay: 90,
			bundle: true
		});
		if(projectiles[0] == null) {return;}
		let projectile = 0;
		let pos;
		let rot;
		let todelete = [];
		// This here exists so it doesnt keep activating on the same spherecomponent over and over again.
		for(var i in projectiles) {
			const pr = projectiles[i].input;
			if(todelete.includes(pr.substr(pr.indexOf(("_C_")),14),1)) {
				todelete.splice(todelete.indexOf(pr.substr(pr.indexOf(("_C_")),14),1));
			}
			if(!spawned.includes(pr.substr(pr.indexOf(("_C_")),14),1)){
				spawned.push(pr.substr(pr.indexOf(("_C_")),14),1);
				projectile = projectiles[i];
			}
		}
		if(todelete[0] !== 1) {
			for(var i in todelete) {
				spawned.splice(spawned.indexOf(todelete[i]),1);
			}
		}
		// e is supposed to prevent it form detecting previous projectiles or whatever idk it doesn't work eitherway.
		if(projectile !== 0 && e) {
			let outer = projectiles[0].input;
			outer = outer.substr(Number(outer.indexOf('PersistentLevel')) + 16, Number(outer.indexOf('CollisionComponent')) - Number(outer.indexOf('PersistentLevel')) - 17);
			const projectileRegExptwo = new RegExp(`${outer}\\.CollisionComponent.RelativeRotation = \\(Pitch=(?<pitch>[\\d\\.-]+),Yaw=(?<yaw>[\\d\\.-]+),Roll=(?<roll>[\\d\\.-]+)\\)`);
			// Gets rotation of the spherecomponent.
			const projrot = await this.omegga.addWatcher(projectileRegExptwo, {
			exec: () =>
			this.omegga.writeln(
				`GetAll SphereComponent RelativeRotation Outer=${outer}`
			),
			timeoutDelay: 90,
			bundle: true
			});
			// Gets BP_PlayerState_C which is used to get the player.
			const projtype = outer.substr(0,outer.indexOf('C_') + 1);
			let plstate = await this.omegga.addWatcher(new RegExp(`BP_PlayerState_C`), {
			exec: () =>
			this.omegga.writeln(
				`GetAll ${projtype} InstigatorState`
			),
			timeoutDelay: 90,
			bundle: true
			});
			if(plstate[0] == null) {return;}
			let bpstate = plstate[0].input;
			bpstate = bpstate.substr(bpstate.indexOf('PersistentLevel.BP_PlayerState_C_') + 16, 27);
			if(projrot[0] == null) {return;}
			pos = projectiles[0].groups;
			rot = projrot[0].groups;
			const projname = projrot[0].input.substr(projrot[0].input.indexOf('Projectile_') + 11, projrot[0].input.indexOf('_C_')-projrot[0].input.indexOf('Projectile_')-11);
			this.raycast(pos, rot, projname, bpstate);
		}
		else if(!e) {
			e = true;
		}
		
	}
	
	async tax() {
		for(var pl in totax) {
			const evader = totax[pl];
			const pid = await this.omegga.getPlayer(evader.name);
			let invn = await this.store.get(pid.id);
			invn.money -= evader.tax;
			if(invn.money < 0) {
				invn.money = 0;
			}
			this.store.set(pid.id,invn);
		}
	}
	
	async runmachines() {
		let usedgenerators = [];
		const toplace =  {...moneybrs, bricks: basecores, brick_owners : [{
		id: '00000000-0000-0000-0000-000000000040',
		name: 'BaseCore',
		bricks: 0}]};
		for(var brk in toplace.bricks) {
			let brick = toplace.bricks[brk];
			brick.owner_index = 1;
			toplace.bricks[brk] = brick;
		}
		if(toplace.bricks.length > 0) {
			setTimeout(() => this.omegga.loadSaveData(toplace,{quiet: true}),1000);
		}
		if(machinesbrs.length === 0) {
			return;
		}
		for(var mcn in machinesbrs) {
			const mcnb = machinesbrs[mcn];
			const data = mcnb.components.BCD_Interact.ConsoleTag.split(' ');
			const pname = data.splice(6,data.length - 6).join(' ');
			if(data[0] === 'Printer' && data[1] === 'Auto') {
				const bpos = mcnb.position;
				
				const generators = machinesbrs.filter(gmcn => gmcn.components.BCD_Interact.ConsoleTag.split(' ')[0] === 'Gen' && Math.sqrt(
				(bpos[0] - gmcn.position[0]) * (bpos[0] - gmcn.position[0]) +
				(bpos[1] - gmcn.position[1]) * (bpos[1] - gmcn.position[1]) +
				(bpos[2] - gmcn.position[2]) * (bpos[2] - gmcn.position[2])
				) < 500 && !usedgenerators.includes(gmcn.position));
				let energy = 0;
				for(var gen in generators) {
					const gdata = generators[gen].components.BCD_Interact.ConsoleTag.split(' ');
					const gpname = gdata.splice(5,data.length - 5).join(' ');
					if(pname === gpname && energy < Number(data[5])) {
						energy += Number(gdata[4]);
						usedgenerators.push(generators[gen].position);
					}
				}
				//console.log(energy, data[5]);
				if(energy >= Number(data[5])) {
					const player = await this.omegga.getPlayer(pname);
					if(online.includes(pname)) {
						let invn = await this.store.get(player.id);
						invn.money += Number(data[4]);
						//console.log(data[4]);
						this.store.set(player.id,invn);
						//this.omegga.whisper(pname,'You machine generated money.')
					}
				}
			}
		}
		let machinestoreload = moneybrs;
		if(machinestoreload.length > 0) {
			machinestoreload.bricks = machinesbrs;
			this.omegga.loadSaveData(machinestoreload,{quiet: true});
		}
		
	}
	
	async turrethandler() {
		let usedgenerators = [];
		const turrets = machinesbrs.filter(smcn => smcn.components.BCD_Interact.ConsoleTag.split(' ')[0] === 'Str')
		for(var pl in online) {
			const player = await this.omegga.getPlayer(online[pl]);
			const ppos = await player.getPosition();
			const inrange = [];
			let prevdist = 100000;
			for(var turt in turrets) {
				const smcn = turrets[turt];
				const data = smcn.components.BCD_Interact.ConsoleTag.split(' ');
				const townr = data.splice(7,data.length - 7).join(' ');
				const dist = Math.sqrt(
				(ppos[0] - smcn.position[0]) * (ppos[0] - smcn.position[0]) +
				(ppos[1] - smcn.position[1]) * (ppos[1] - smcn.position[1]) +
				(ppos[2] - smcn.position[2]) * (ppos[2] - smcn.position[2])
				);
				if(dist < Number(data[5]) * 10 && dist < prevdist&& townr != online[pl]) {
					inrange[0] = smcn;
					prevdist = dist;
				}
				
			}
			const dead = await player.isDead();
			if(inrange.length > 0 && !dead) {
				for(var ir in inrange) {
					const data = inrange[ir].components.BCD_Interact.ConsoleTag.split(' ');
					const townr = data.splice(7,data.length - 7).join(' ');
					const inrp = inrange[ir].position;
					const generators = machinesbrs.filter(gmcn => gmcn.components.BCD_Interact.ConsoleTag.split(' ')[0] === 'Gen' && Math.sqrt(
					(inrp[0] - gmcn.position[0]) * (inrp[0] - gmcn.position[0]) +
					(inrp[1] - gmcn.position[1]) * (inrp[1] - gmcn.position[1]) +
					(inrp[2] - gmcn.position[2]) * (inrp[2] - gmcn.position[2])
					) < 500 && !usedgenerators.includes(gmcn.position));
					let energy = 0;
					const trust = await this.store.get("Trusted");
					let notdamage = false;
					for(var gen=0;gen<generators.length;gen++) {
						const gdata = generators[gen].components.BCD_Interact.ConsoleTag.split(' ');
						const gpname = gdata.splice(5,data.length - 5).join(' ');
						if(townr === gpname && energy < Number(data[6])) {
							energy += Number(gdata[4]);
							usedgenerators.push(generators[gen].position);
						}
						if(energy >= Number(data[6])) {
							gen = generators.length;
						}
					}
					if(energy >= Number(data[6])) {
						const damage = Number(data[4]);
						const bps = Number(data[2]);
						for(var trs in trust) {
							const trusted = trust[trs];
							if(trusted.player === townr && trusted.trusts === online[pl]) {
								notdamage = true;
							}
						}
						const disttopl = Math.sqrt(
						(ppos[0] - inrp[0]) * (ppos[0] - inrp[0]) +
						(ppos[1] - inrp[1]) * (ppos[1] - inrp[1]) +
						(ppos[2] - inrp[2]) * (ppos[2] - inrp[2])
						);
						if(townr != online[pl] && !notdamage) {
							let brs = await this.omegga.getSaveData({center: inrp, extent: [turretrange,turretrange,turretrange]});
							let canshoot = true;
							let hitbrick = [];
							if(brs != null) {
								const yaw = Math.atan2(ppos[1] - inrp[1],ppos[0] - inrp[0]) * 180 / Math.PI;
								const distl = Math.sqrt(
								(ppos[0] - inrange[ir].position[0]) * (ppos[0] - inrp[0]) +
								(ppos[1] - inrange[ir].position[1]) * (ppos[1] - inrp[1])
								);
								const pitch = Math.atan2(ppos[2] - inrange[ir].position[2],distl) * 180 / Math.PI;
								const deg2rad = Math.PI / 180;
								let ray1 = {x: inrange[ir].position[0], y: inrange[ir].position[1], z: inrange[ir].position[2]};
								for(var B in brs.bricks) {
									let ray2 = {
									x: inrange[ir].position[0] + Math.sin((-yaw + 90) * deg2rad) * turretrange * Math.cos(pitch * deg2rad),
									y: inrange[ir].position[1] + Math.cos((-yaw + 90) * deg2rad) * turretrange * Math.cos(pitch * deg2rad),
									z: inrange[ir].position[2] + turretrange * Math.sin(pitch * deg2rad)
									};
			
									let brick = brs.bricks[B];
									let size = brick.size;
									if(size[0] === 0) {
										size = specials[brs.brick_assets[brick.asset_name_index]];
									}
									if(brick.rotation%2 == 1) {
										size = [size[1],size[0],size[2]];
									}
									const directions = [[2,1,0],[0,2,1],[0,1,2]];
									const brdr = Math.floor(brick.direction/2);
									size = [size[directions[brdr][0]],size[directions[brdr][1]],size[directions[brdr][2]]];
									brick.size = size;
									const bpos = brick.position;
									const BP1 = {
									x: bpos[0] - size[0],
									y: bpos[1] - size[1],
									z: bpos[2] - size[2],
									};
									const BP2 = {
									x: bpos[0] + size[0],
									y: bpos[1] + size[1],
									z: bpos[2] + size[2],
									};
									if(await raycasttest.CheckLineBox(BP1, BP2, ray1, ray2)) {
										hitbrick.push({p: bpos, s: size});
									}
								}
							}
							let over = false;
							for(var b in hitbrick) {
								const br = hitbrick[b];
								if(br.p[0] !== inrange[ir].position[0] && br.p[1] !== inrange[ir].position[1] && br.p[2] !== inrange[ir].position[2] && !over) {
									const disttobr = Math.sqrt(
									(br.p[0] - inrange[ir].position[0]) * (br.p[0] - inrange[ir].position[0]) +
									(br.p[1] - inrange[ir].position[1]) * (br.p[1] - inrange[ir].position[1]) +
									(br.p[2] - inrange[ir].position[2]) * (br.p[2] - inrange[ir].position[2])
									);
									if(disttobr < disttopl) {
										over = true;
										canshoot = false;
									}
								}
							}
							if(canshoot) {
								const interval = setInterval(() => this.turretdamageplayer(player,damage), Math.floor(1000 / bps));
								setTimeout(() => clearInterval(interval), 999);
							}
						}
					}
				}
			}
		}
	}
	//less lag = better so i am resorting to doing it this way
	async turretdamageplayer(player, damage) {
		player.damage(damage);
	}
	
	async skipdecrementnturrets() {
		if(enablechecker && online.length > 0) {
			this.turrethandler();
		}
		if(skipcooldown > 0) {
			skipcooldown--;
		}
		if(skiptime > 0) {
			skiptime--;
			if(skiptime === 0) {
				this.omegga.broadcast(clr.red + '<b>Not enough people have voted to skip the round. Skip has been cancelled.</>');
				wanttoskip = [];
				skipcooldown = 30;
			}
		}
	}
	
	async decrement(enabled) {
		if(enablechecker) {
			this.runmachines();
			this.tax();
		}
		time--;
		switch(time) {
			case 3:
				this.omegga.broadcast('<b>'+clr.ylw+'3</color> minutes remaining.</>');
				break;
			case 2:
				this.omegga.broadcast('<b>'+clr.orn+'2</color> minutes remaining.</>');
				break;
			case 1:
				this.omegga.broadcast('<b>'+clr.red+'1</color> minute remaining.</>');
				break;
			case 0:
				this.omegga.broadcast('<b>Time\'s up!</>');
				this.modetoggle("egg");
				break;
		}
	}
	
	async raycast(pos, rot, type, playerstate) {
		let brs = await this.omegga.getSaveData({center: [pos.x,pos.y,pos.z], extent: [projrange,projrange,projrange]});
		if(brs == null) {return;}
		const yaw = Number(rot.yaw);
		const pitch = Number(rot.pitch);
		const deg2rad = Math.PI / 180;
		let ray1 = {x: Number(pos.x), y: Number(pos.y), z: Number(pos.z)};
		let hitbrick = [];
		let projradius = 0;
		let projdamage = 0;
		switch(type) {
			case 'ImpactGrenade':
				projradius = 30;
				projdamage = 10;
				break;
			case 'ImpactGrenadeLauncher':
				projradius = 15;
				projdamage = 8;
				break;
			case 'RocketLauncher':
				projradius = 80;
				projdamage = 30;
				break;
			case 'QuadLauncher':
				projradius = 30;
				projdamage = 12;
				break;
			case 'Bazooka':
				projradius = 30;
				projdamage = 8
				break;
			case 'TwinCannon':
				projradius = 20;
				projdamage = 16;
				break;
			default:
				return;
		}
		for(var B in brs.bricks) {
			
			let ray2 = {
			x: Number(pos.x) + Math.sin((-yaw + 90) * deg2rad) * projrange * Math.cos(pitch * deg2rad),
			y: Number(pos.y) + Math.cos((-yaw + 90) * deg2rad) * projrange * Math.cos(pitch * deg2rad),
			z: Number(pos.z) + projrange * Math.sin(pitch * deg2rad)
			};
			
			let brick = brs.bricks[B];
			let size = brick.size;
			if(size[0] === 0) {
				size = specials[brs.brick_assets[brick.asset_name_index]];
			}
			if(brick.rotation%2 == 1) {
				size = [size[1],size[0],size[2]];
			}
			const directions = [[2,1,0],[0,2,1],[0,1,2]];
			const brdr = Math.floor(brick.direction/2);
			size = [size[directions[brdr][0]],size[directions[brdr][1]],size[directions[brdr][2]]];
			brick.size = size;
			//console.log(brick);
			const bpos = brick.position;
			const BP1 = {
			x: bpos[0] - size[0],
			y: bpos[1] - size[1],
			z: bpos[2] - size[2],
			};
			const BP2 = {
			x: bpos[0] + size[0],
			y: bpos[1] + size[1],
			z: bpos[2] + size[2],
			};
			if(await raycasttest.CheckLineBox(BP1, BP2, ray1, ray2)) {
				hitbrick.push({p: bpos, s: size});
			}
		}
		let closetbrick = projrange;
		let brc = 0
		// Get the closest brick.
		for(var b in hitbrick) {
			const br = hitbrick[b];
			const distance = Math.sqrt((br.p[0] - ray1.x)*(br.p[0] - ray1.x)+(br.p[1] - ray1.y)*(br.p[1] - ray1.y)+(br.p[2] - ray1.z)*(br.p[2] - ray1.z));
			if(distance < closetbrick) {
				closetbrick = distance;
				brc = br;
			}
		}
		if(brc.s == null) {return;}
		if(brc !== 0) {
			brc.s = [Math.max(brc.s[0],projradius),Math.max(brc.s[1],projradius),Math.max(brc.s[2],projradius)];
			let moneymcn = 0;
			let isdamaged = true;
			for(var mcn in machinesbrs) {
				if(machinesbrs[mcn].position[0] === brc.p[0] && machinesbrs[mcn].position[1] === brc.p[1] && machinesbrs[mcn].position[2] === brc.p[2]) {
					moneymcn = machinesbrs[mcn];
					let moneybrick = moneybrs.bricks[0];
					moneybrick.position = [Math.floor(Number(pos.x)),Math.floor(Number(pos.y)),Math.floor(Number(pos.z))];
					let mmcnd = moneymcn.components.BCD_Interact.ConsoleTag.split(' ');
					mmcnd[2] = Number(mmcnd[2]) - projdamage;
					if(Number(mmcnd[2]) > 0) {
						this.omegga.middlePrint(playerstate,'<b>Machine health: ' + mmcnd[2] + '</>');
						machinesbrs[mcn].components.BCD_Interact.ConsoleTag = mmcnd.join(' ');
						isdamaged = false;
					}
					else {
					if(mmcnd[3] > 0) {
						this.omegga.middlePrint(playerstate,clr.ylw + '<b>$' + clr.dgrn + Math.floor(Number(mmcnd[3]) * 0.8) + '</>');
						const powner = await this.omegga.getPlayer(playerstate);
						let invn = await this.store.get(powner.id);
						invn.money += Math.floor(Number(mmcnd[3]) * 0.8);
						this.store.set(powner.id, invn);
						/*
						moneybrick.components.BCD_Interact.ConsoleTag = 'Money ' + Math.floor(Number(mmcnd[3]) * 0.8);
						const toplace =  {...moneybrs, bricks: [moneybrick], brick_owners : [{
						id: '00000000-0000-0000-0000-000000000080',
						name: 'Money',
						bricks: 0}]};
						this.omegga.loadSaveData(toplace,{quiet: true});
						*/
					}
					let pname = '';
					if(mmcnd.includes('Printer')) {
						pname = mmcnd.splice(6,mmcnd.length - 6).join(' ');
					}
					else if(mmcnd.includes('Str')) {
						pname = mmcnd.splice(7,mmcnd.length - 7).join(' ');
					}
					else {
						pname = mmcnd.splice(5,mmcnd.length - 5).join(' ');
					}
					if(mmcnd.includes('Manual')) {
						pname = mmcnd.splice(4,mmcnd.length - 4).join(' ');
					}
					if(online.includes(pname)) {
						this.omegga.whisper(pname, clr.red + '<b>One of your machines has been destroyed!</>');
					}
					machinesbrs.splice(mcn,1);
					}
				}
			}
			if(isdamaged) {
				this.omegga.clearRegion({center: brc.p, extent: brc.s});
			}
		}
	}
	
	async getrotation(controller) {
		const rotRegExp = new RegExp(`${controller}\\.TransformComponent0.RelativeRotation = \\(Pitch=(?<x>[\\d\\.-]+),Yaw=(?<y>[\\d\\.-]+),Roll=(?<z>[\\d\\.-]+)\\)`);
		const [
		{
			groups: { x, y, z },
		},
		] = await this.omegga.addWatcher(rotRegExp, {
			exec: () =>
			this.omegga.writeln(
				`GetAll SceneComponent RelativeRotation Outer=${controller}`
			),
			timeoutDelay: 100,
			bundle: true
		});
		return [Number(x),Number(y),Number(z)];
	}
	
	async test() {
		const rotRegExp = new RegExp(``);
		const test = await this.omegga.addWatcher(rotRegExp, {
			exec: () =>
			this.omegga.writeln(
				`GetAll SphereComponent RelativeRotation Name=Projectile`
			),
			timeoutDelay: 100,
			bundle: true
		});
		console.log(test);
	}
	
	//merca
	async preparetax(brickowners) {
		totax = [];
		for(var owner in brickowners) {
			const brickowner = brickowners[owner];
			if(brickowner.bricks > minbrickcount) {
				const tax = Math.ceil((brickowner.bricks - minbrickcount) / 6);
				this.omegga.whisper(brickowner.name, clr.orn + '<b>You have exceeded a minimum brick count of ' + clr.ylw + minbrickcount + clr.orn + ' bricks. You now will be taxed ' + clr.ylw + '$' + clr.dgrn + tax + clr.orn + ' each minute.</>');
				totax.push({name: brickowner.name, tax: tax});
			}
		}
	}
	
	async modetoggle(name) {
		enablechecker = !enablechecker;
		const players = this.omegga.getPlayers();
		if(enablechecker) {
			if(players == null || players === []) {
				enablechecker = false;
				return;
			}
			for(var pl in players) {
				const player = players[pl];
				this.omegga.getPlayer(player.id).setTeam(1);
			}
			let brs = await this.omegga.getSaveData();
			if(brs == null) {return;}
			let bricjowners = brs.brick_owners.filter(owner => online.includes(owner.name));
			machinesbrs = brs;
			machinesbrs = machinesbrs.bricks.filter(machine => 'BCD_Interact' in machine.components && machinesbrs.brick_owners[machine.owner_index - 1].name.indexOf('MCN') === 0 && Math.abs(machine.position[0]) < XYBoundry * 10 && Math.abs(machine.position[1]) < XYBoundry * 10 && machine.position[2] < ZBoundry * 10 && machine.position[2] >= 0);
			const cores = brs.bricks.filter(brick => 'BCD_Interact' in brick.components && brs.brick_owners[brick.owner_index - 1].name.indexOf('BaseCore') !== -1);
			basecores = cores;
			brs.bricks = brs.bricks.filter(brick => 'BCD_ItemSpawn' in brick.components);
			for(var br in brs.bricks) {
				const brick = brs.bricks[br];
				let size = brick.size;
				if(brick.rotation%2 == 1) {
					size = [size[1],size[0],size[2]];
				}
				this.omegga.clearRegion({center: brick.position, extent: size});
			}
			this.omegga.broadcast("<size=\"50\"><b>Fight!</>");
			this.omegga.broadcast("<b>You have " + fighttime + " minutes of fight time.</>");
			this.preparetax(bricjowners);
			time = fighttime;
		}
		else {
			const players = this.omegga.getPlayers();
			for(var pl in players) {
				const player = players[pl];
				this.omegga.getPlayer(player.id).setTeam(0);
				const invnt = await this.store.get(player.id);
				const pos = (invnt.base).join(" ");
				const playername = player.name;
				if(pos.length > 0) {
					this.omegga.writeln('Chat.Command /TP '+playername+' ' +pos+' 0');
				}
			}
			this.omegga.broadcast("<size=\"50\"><b>Build!</>");
			this.omegga.broadcast("<b>You have " + buildtime + " minutes of build time.</>");
			time = buildtime;
		}
	}
	
	async initializemachines() {
		const machinefolder = fs.readdirSync(__dirname + "/Machines");
		for(var mcn in machinefolder) {
			const machinefile = fs.readFileSync(__dirname + "/Machines/"+machinefolder[mcn]);
			let machine = brs.read(machinefile);
			let machinename = machinefolder[mcn];
			machinename = machinename.substr(0,machinename.length - 4);
			const databrick = machine.bricks.filter(brick => 'BCD_Interact' in brick.components);
			machines.push({name: machinename, brs: machine, data: databrick[0].components.BCD_Interact});
		}
	}
	
	async init() {
		const deathevents = await this.omegga.getPlugin('deathevents');
		if(deathevents) {
			console.log('Deathevents detected.');
			deathevents.emitPlugin('subscribe');
		}
		else {
			console.error('You need deathevents plugin to run this.');
			return;
		}
		this.initializemachines();
		weapons = await weplist.list()
		specials = await speciallist.list();
		
		this.omegga.on('cmd:enable', async name => {
			this.modetoggle(name);
		})
		
		.on('cmd:test', async player => {
			this.runmachines();
		})
		/*
		this.omegga.on('cmd:test2', async name => {
			this.omegga.getPlayer(name).damage(10);
			console.log("test");
		});
		*/
		this.omegga.on('cmd:place', async (name, ...args) => {
			const mcntoplace = args.join(' ');
			let machinert = machines.filter(mcn => mcn.name === mcntoplace);
			const player = await this.omegga.getPlayer(name);
			const ppos = await player.getPosition();
			let nearbybricks = await this.omegga.getSaveData({center: [Math.floor(ppos[0]), Math.floor(ppos[1]), Math.floor(ppos[2])], extent: [projrange,projrange,projrange]});
			let invn = await this.store.get(player.id);
			if(machinert.length > 0) {
				if(!(invn.machines.includes(mcntoplace) || mcntoplace === 'manual printer')) {
					this.omegga.whisper(name, clr.red+'<b>You don\'t have that machine.</>');
					return;
				}
				machinert = machinert[0];
				// VVV i will not forgive javascript for this
				const mcnbrs = JSON.parse(JSON.stringify(machinert.brs));
				mcnbrs.brick_owners = [{
					id: '00000000-0000-0000-0000-000000000060',
					name: 'MCN',
					bricks: 0
				}];
				ppos[0] = Math.round(ppos[0]/10)*10;
				ppos[1] = Math.round(ppos[1]/10)*10;
				ppos[2] = Math.round(ppos[2]);
				if(Math.abs(ppos[0]) > XYBoundry * 10 || Math.abs(ppos[1]) > XYBoundry * 10 || Math.abs(ppos[2]) > ZBoundry * 10 || Math.abs(ppos[2]) < 0) {
					this.omegga.whisper(name, clr.red + '<b>You can\'t place machines outside the boundries.</>');
					return;
				}
				let mcnsize = [0,0,0];
				for(var b=0;b<mcnbrs.brick_count;b++) {
					let brick = mcnbrs.bricks[b];
					if('components' in brick) {
						if('BCD_Interact' in brick.components) {
							brick.components.BCD_Interact.ConsoleTag = brick.components.BCD_Interact.ConsoleTag + ' ' + name;
							mcnbrs.bricks[b] = brick;
						}
					}
					let size = brick.size;
					const rotation = brick.rotation;
					if(rotation%2 == 1) {
						size = [size[1],size[0],size[2]];
					}
					/*
					brick.size = size;
					if(mcnsize[0] < brick.size[0]) {
						mcnsize[0] = brick.size[0];
					}
					if(mcnsize[1] < brick.size[1]) {
						mcnsize[1] = brick.size[1];
					}
					if(mcnsize[2] < brick.size[2]) {
						mcnsize[2] = brick.size[2];
					}
					*/
					mcnsize = size;
				}
				if(nearbybricks != null) {
				for(var b in nearbybricks.bricks) {
					let brick = nearbybricks.bricks[b];
					let size = brick.size;
					const rotation = brick.rotation;
					if(rotation%2 == 1) {
						size = [size[1],size[0],size[2]];
					}
					const directions = [[2,1,0],[0,2,1],[0,1,2]];
					const brdr = Math.floor(brick.direction/2);
					size = [size[directions[brdr][0]],size[directions[brdr][1]],size[directions[brdr][2]]];
					nearbybricks.bricks[b] = {...brick, size: size};
				}
				const colliding = nearbybricks.bricks.filter(
					brck => brck.position[0] < ppos[0] + mcnsize[0] + brck.size[0] &&
					brck.position[0] > ppos[0] - mcnsize[0] - brck.size[0] &&
					brck.position[1] < ppos[1] + mcnsize[1] + brck.size[1] &&
					brck.position[1] > ppos[1] - mcnsize[1] - brck.size[1] &&
					brck.position[2] < ppos[2] - 25 + mcnsize[2] + brck.size[2] + mcnsize[2] &&
					brck.position[2] > ppos[2] - 25 - brck.size[2]
				);
				if(colliding.length > 0) {
					this.omegga.whisper(name,clr.red+'<b>The machine is overlapping with other bricks.</>');
					return;
				}
				}
				let br = mcnbrs.bricks[0];
				br.position = [br.position[0] + ppos[0], br.position[1] + ppos[1], br.position[2] + ppos[2] - 25];
				let topl = {...mcnbrs, bricks: [br]};
				this.omegga.loadSaveData(topl,{quiet: true});
				invn.machines.splice(invn.machines.indexOf(mcntoplace),1);
				this.store.set(player.id,invn);
				machinesbrs.push(br);
				this.omegga.whisper(name,'<b>Succesfully placed ' + clr.ylw + machinert.name + '</color>.</>');
				const ontop = [br.position[0], br.position[1], br.position[2] + br.size[2]];
				this.omegga.writeln('Chat.Command /TP '+name+' ' +ontop.join(' ')+' 0');
			}
		})
		.on('cmd:skip', async name => {
			const players = this.omegga.players;
			const minimum = players.length * 0.8;
			if(skipcooldown > 0) {
				this.omegga.whisper(name, clr.red + '<b>You must wait ' + clr.orn + skipcooldown + clr.red + ' seconds before starting a next vote skip.</>');
				return;
			}
			if(wanttoskip.includes(name)) {
				this.omegga.whisper(name, clr.orn + '<b>You already have voted to skip</>');
				return;
			}
			if(skiptime === 0) {
				this.omegga.broadcast(clr.ylw + '<b>' + name + clr.grn + ' has started a vote skip!</>');
				skiptime = 30;
				minplayers = Math.ceil(minimum);
			}
			wanttoskip.push(name);
			const lefttovote = minplayers - wanttoskip.length;
			this.omegga.broadcast(clr.ylw + '<b>' + name + '</></><b> wants to skip this round. Atleast ' + clr.grn + lefttovote + '</><b> more players needed to skip the round.</>');
			if(lefttovote < 1) {
				this.omegga.broadcast(clr.ylw + '<b>Enouph players have voted to skip this round.</>');
				skiptime = 0;
				wanttoskip = [];
				time = 1;
				this.decrement(true);
				skipcooldown = 30;
			}
		})
		.on('cmd:pay', async (name, ...args) => {
			const money = Number(args[0]);
			args.splice(0,1);
			const player = args.join(' ');
			if(!online.includes(player)) {
				this.omegga.whisper(name, clr.red + '<b>That player either doesn\'t exist or they are not online.</>');
				return;
			}
			if(money < 0) {
				this.omegga.whisper(name, clr.red + '<b>Negative money doesn\'t exist.</>');
				return;
			}
			if(isNaN(money)) {
				this.omegga.whisper(name, clr.red + '<b>NaN money doesn\'t exist.</> <emoji>egg</>');
				return;
			}
			const pid1 = await this.omegga.getPlayer(name);
			let invn = await this.store.get(pid1.id);
			if(invn.money < money) {
				this.omegga.whisper(name, clr.red + '<b>You don\'t have enouph money to pay ' + clr.ylw + '$' + clr.dgrn + money + clr.red + '.</>');
				return;
			}
			invn.money -= money;
			this.store.set(pid1.id, invn);
			const pid2 = await this.omegga.getPlayer(player);
			let reciver = await this.store.get(pid2.id);
			reciver.money += money;
			this.store.set(pid2.id, reciver);
			this.omegga.whisper(name, '<b>You have paid ' + clr.ylw + '$' + clr.dgrn + money + '</></><b> to ' + clr.ylw + player + '</><b>.</>');
			this.omegga.whisper(player, '<b>You have recieved ' + clr.ylw + '$' + clr.dgrn + money + '</></><b> from ' + clr.ylw + name + '</><b>.</>');
		})
		.on('interact', async data => {
			if(data.message.indexOf('Money') === 0) {
				const argsarray = data.message.split(' ');
				const checklegitimacy = await this.omegga.getSaveData({center: data.position, extent: [5, 10, 2]});
				if(checklegitimacy == null) {
					return;
				}
				if(checklegitimacy.brick_owners[0].name === 'Money') {
					let invn = await this.store.get(data.player.id);
					invn.money += Number(argsarray[1]);
					this.store.set(data.player.id, invn);
					this.omegga.middlePrint(data.player.name, clr.ylw + '<b>$' + clr.dgrn + argsarray[1] + '</>');
					this.omegga.clearRegion({center: data.position, extent: [5, 10, 2]});
				}
				return;
			}
			const checklegitimacy = machinesbrs.filter(brick => brick.position.join(' ') === data.position.join(' '));
			if(checklegitimacy.length === 0) { return; }
			const argsarray = data.message.split(' ');
			if(argsarray[4] === data.player.name && !mcntimeout.includes(data.player.id)) {
				if(!enablechecker) {
					this.omegga.middlePrint(data.player.name,clr.red+'<b>Printers can only work during fight mode.</>');
					return;
				}
				if(argsarray[0] === 'Printer' && argsarray[1] === 'Manual') {
					let pdata = await this.store.get(data.player.id);
					pdata.money += 2;
					this.store.set(data.player.id,pdata);
					mcntimeout.push(data.player.id);
					setTimeout(() => mcntimeout.splice(mcntimeout.indexOf(data.player.id),1), 5000);
				}
			}
			else if(mcntimeout.includes(data.player.id)) {
				this.omegga.middlePrint(data.player.name,clr.red+'<b>You need to wait 5 seconds before using this machine again.</>');
			}
		})
		.on('cmd:changelog', async name => {
			this.omegga.whisper(name, clr.ylw + "<size=\"30\"><b>--ChangeLog--</>");
			this.omegga.whisper(name, clr.orn + "<b>Players can only be targeted by 1 closest turret. This was made to improve perfomance.</>");
			this.omegga.whisper(name, clr.orn + "<b>Hopefully fixed base cores not being indestructable.</>");
			this.omegga.whisper(name, clr.orn + "<b>Extended sniper turret range.</>");
			this.omegga.whisper(name, clr.orn + "<b>Removed darbot.</>");
			this.omegga.whisper(name, clr.ylw + "<b>PGup n PGdn to scroll." + clr.end);
		})
		.on('cmd:placecore', async name => {
			const player = await this.omegga.getPlayer(name);
			const ppos = await player.getPosition();
			const alreadyplaced = basecores.filter(brick => brick.components.BCD_Interact.ConsoleTag.indexOf(name) > -1);
			if(alreadyplaced.length > 0) {
				this.omegga.whisper(name, clr.red + '<b>You can\'t have more than 1 core.</>');
				return;
			}
			let nearbybricks = await this.omegga.getSaveData({center: [Math.floor(ppos[0]), Math.floor(ppos[1]), Math.floor(ppos[2])], extent: [projrange,projrange,projrange]});
			let core = corebrs.bricks[0];
			ppos[0] = Math.round(ppos[0]/10)*10;
			ppos[1] = Math.round(ppos[1]/10)*10;
			ppos[2] = Math.round(ppos[2]);
			core.position = ppos;
			const mcnsize = core.size
			if(nearbybricks != null) {
				for(var b in nearbybricks.bricks) {
					let brick = nearbybricks.bricks[b];
					let size = brick.size;
					const rotation = brick.rotation;
					if(rotation%2 == 1) {
						size = [size[1],size[0],size[2]];
					}
					const directions = [[2,1,0],[0,2,1],[0,1,2]];
					const brdr = Math.floor(brick.direction/2);
					size = [size[directions[brdr][0]],size[directions[brdr][1]],size[directions[brdr][2]]];
					nearbybricks.bricks[b] = {...brick, size: size};
				}
				const colliding = nearbybricks.bricks.filter(
					brck => brck.position[0] < ppos[0] + mcnsize[0] + brck.size[0] &&
					brck.position[0] > ppos[0] - mcnsize[0] - brck.size[0] &&
					brck.position[1] < ppos[1] + mcnsize[1] + brck.size[1] &&
					brck.position[1] > ppos[1] - mcnsize[1] - brck.size[1] &&
					brck.position[2] < ppos[2] - 25 + mcnsize[2] + brck.size[2] + mcnsize[2] &&
					brck.position[2] > ppos[2] - 25 - brck.size[2]
				);
				if(colliding.length > 0) {
					this.omegga.whisper(name,clr.red+'<b>The core is overlapping with other bricks.</>');
					return;
				}
			}
			core.components.BCD_Interact.ConsoleTag = name;
			const toplace = {...corebrs, bricks: [core], brick_owners: [{
				id: '00000000-0000-0000-0000-000000000040',
				name: 'BaseCore',
				bricks: 0
			}]};
			basecores.push(core);
			this.omegga.loadSaveData(toplace, {quiet: true});
			this.omegga.whisper(name, clr.ylw + '<b>Succesfully placed the base core.</>');
		})
		.on('cmd:removecore', async name => {
			const core = basecores.filter(brick => brick.components.BCD_Interact.ConsoleTag.indexOf(name) > -1);
			if(core.length === 0) {
				this.omegga.whisper(name, clr.red + '<b>You don\'t have any cores.</>');
				return;
			}
			basecores.splice(basecores.indexOf(core), 1);
			this.omegga.clearRegion({center: core[0].position, extent: core[0].size});
			this.omegga.whisper(name, clr.ylw + '<b>Removed a base core sucessfully.</>');
		})
		.on('cmd:refund', async name => {
			const player = await this.omegga.getPlayer(name);
			let pos = await player.getPosition();
			let rot = await this.getrotation(player.controller);
			let brs = await this.omegga.getSaveData({center: pos, extent: [100,100,100]});
			if(brs == null) {return;}
			pos = {x: pos[0], y: pos[1], z: pos[2]};
			rot = {pitch: rot[0], yaw: rot[1], roll: rot[2]};
			const yaw = Number(rot.yaw);
			const pitch = Number(rot.pitch);
			const deg2rad = Math.PI / 180;
			let ray1 = {x: pos.x, y: pos.y, z: pos.z};
			let hitbrick = [];
			for(var B in brs.bricks) {
				
				let ray2 = {
				x: Number(pos.x) + Math.sin((-yaw + 90) * deg2rad) * projrange * Math.cos(pitch * deg2rad),
				y: Number(pos.y) + Math.cos((-yaw + 90) * deg2rad) * projrange * Math.cos(pitch * deg2rad),
				z: Number(pos.z) + projrange * Math.sin(pitch * deg2rad)
				};
				
				let brick = brs.bricks[B];
				let size = brick.size;
				if(brick.rotation%2 == 1) {
					size = [size[1],size[0],size[2]];
				}
				brick.size = size;
				const bpos = brick.position;
				const BP1 = {
				x: bpos[0] - size[0],
				y: bpos[1] - size[1],
				z: bpos[2] - size[2],
				};
				const BP2 = {
				x: bpos[0] + size[0],
				y: bpos[1] + size[1],
				z: bpos[2] + size[2],
				};
				if(await raycasttest.CheckLineBox(BP1, BP2, ray1, ray2)) {
					hitbrick.push({p: bpos, s: size});
				}
			}
			let closetbrick = 100;
			let brc = 0
			if(hitbrick.length === 0) {
				this.omegga.whisper(name,clr.red + '<b>Can\'t find any machines infront. Maybe try looking from a different angle? Or get closer.</>');
				return;
			}
			for(var b in hitbrick) {
				const br = hitbrick[b];
				const distance = Math.sqrt((br.p[0] - ray1.x)*(br.p[0] - ray1.x)+(br.p[1] - ray1.y)*(br.p[1] - ray1.y)+(br.p[2] - ray1.z)*(br.p[2] - ray1.z));
				if(distance < closetbrick) {
					closetbrick = distance;
					brc = br;
				}
			}
			if(brc.s == null) {return;}
			if(brc !== 0) {
				brc.s = [Math.max(brc.s[0],0),Math.max(brc.s[1],0),Math.max(brc.s[2],0)];
				let moneymcn = 0;
				let invn = await this.store.get(player.id);
				for(var mcn in machinesbrs) {
					if(machinesbrs[mcn].position[0] == brc.p[0] && machinesbrs[mcn].position[1] == brc.p[1] && machinesbrs[mcn].position[2] == brc.p[2]) {
						moneymcn = machinesbrs[mcn];
						const data = moneymcn.components.BCD_Interact.ConsoleTag.split(' ');
						let pname = '';
						if(data.includes('Printer') && !data.includes('Manual')) {
							pname = data.splice(6,data.length - 6).join(' ');
						}
						else if(data.includes('Manual')){
							pname = data.splice(4,data.length - 4).join(' ');
						}
						else if(data.includes('Str')){
							pname = data.splice(7,data.length - 7).join(' ');
						}
						else {
							pname = data.splice(5,data.length - 5).join(' ');
						}
						if(pname === player.name) {
						let moneybrick = moneybrs.bricks[0];
						moneybrick.position = [Math.floor(Number(pos.x)),Math.floor(Number(pos.y)),Math.floor(Number(pos.z))];
						const mmcnd = moneymcn.components.BCD_Interact.ConsoleTag.split(' ');
						if(mmcnd[3] > 0) {
							invn.money += Math.floor(Number(mmcnd[3]) * 0.7);
							this.store.set(player.id,invn);
						}
						
						this.omegga.clearRegion({center: brc.p, extent: brc.s});
						machinesbrs.splice(mcn,1);
						this.omegga.whisper(name,clr.ylw +'<b>Machine refunded succesfully.</>');
						}
						else {
							this.omegga.whisper(name,clr.red + '<b>This machine belongs to ' + pname + '.</>');
						}
					}
				}
			}
		})
		.on('cmd:trust', async (name, ...args) => {
			const arg = args[0];
			args.splice(0,1);
			const trustpl = args.join('');
			const player = this.omegga.getPlayer(name);
			let trust = await this.store.get("Trusted");
			switch(arg) {
				case 'add':
					trust.push({player: name, trusts: trustpl});
					this.store.set("Trusted",trust);
					this.omegga.whisper(name,clr.grn + '<b>You now trust ' + trustpl + '.</>');
					break;
				case 'remove':
					const trs = trust.filter(e => e.player === name && e.trusts === trustpl);
					if(trs.length === 0) {
						this.omegga.whisper(name,clr.red + '<b>You don\'t have that player trusted yet.</>');
						return;
					}
					trust.splice(trust.indexOf(trs[0]),1);
					this.store.set("Trusted", trust);
					this.omegga.whisper(name,clr.orn + '<b>You nolonger trust ' + trustpl + '.</>');
					break;
				default:
					const trs2 = trust.filter(e => e.player === name);
					this.omegga.whisper(name,clr.grn + '<b>---Trusted---</>');
					for(var t in trs2) {
						this.omegga.whisper(name,clr.ylw + '<b>' + trs2[t].trusts + '</>');
					}
					this.omegga.whisper(name, clr.ylw + "<b>PGup n PGdn to scroll." + clr.end);
					break;
			}
		})
		.on('cmd:buy', async (name, ...args) => {
			const test = args.join(' ');
			//switch(args[0]) {
				//case 'weapon':
				if(shoplist.filter(wpn => wpn.weapon === test).length > 0) {
					const weapon = args.join(' ');
					const shopweapon = shoplist.filter(wpn => wpn.weapon === weapon);
					if(shopweapon.length > 0) {
						const player = await this.omegga.getPlayer(name);
						let invn = await this.store.get(player.id);
						if(invn.money >= shopweapon[0].price) {
							invn.money -= shopweapon[0].price;
							invn.inv.push(shopweapon[0].weapon);
							this.omegga.whisper(name, '<b>You have bought: ' + clr.ylw + shopweapon[0].weapon + '</color>.</>');
							this.store.set(player.id,invn);
						}
						else {
							this.omegga.whisper(name, clr.red + '<b>You don\'t have enough money to buy that weapon.</>');
						}
					}
					//break;
				}
				else if(machines.filter(mcn => mcn.name === test).length > 0) {
				//case 'machine':
					const machine = args.join(' ');
					if(machine == 'manual printer') {
						this.omegga.whisper(name,clr.ylw+'<i><b>The machine is free lmao.</>');
						return;
					}
					const isvalid = machines.filter(mcn => mcn.name === machine);
					const data = isvalid[0].data.ConsoleTag.split(' ');
					const player = await this.omegga.getPlayer(name);
					let invn = await this.store.get(player.id);
					if(invn.money < data[3]) {
						this.omegga.whisper(name, clr.red + '<b>You don\'t have enough money to buy that machine.</>');
						return;
					}
					invn.money -= Number(data[3]);
					invn.machines.push(machine);
					this.store.set(player.id,invn);
					this.omegga.whisper(name, '<b>You have bought: ' + clr.ylw + machine + '</color>.</>');
					//break;
				}
				else {
				//default:
					this.omegga.whisper(name,clr.red+'<b>That item doesn\'t exist.</>');
					//break;
				}
			//}
		})
		.on('leave', async player => {
			if(online.indexOf(player.name) > -1){
				online.splice(online.indexOf(player.name),1);
			}
		})
		.on('join', async player => {
			const keys = await this.store.keys();
			if(!keys.includes(player.id)) {
				this.store.set(player.id,{inv: ['pistol','impact grenade'], money: 0, base: [], selected: ['pistol','impact grenade'], machines: [], charm: ''});
				this.omegga.whisper(player.name,clr.grn+'<b>You\'re new so you recieved basic guns. Please use /basewars for basic info.</>')
			}
			let invn = await this.store.get(player.id);
			online.push(player.name);
			if(!keys.includes("Trusted")){
				this.store.set("Trusted",[]);
			}
			if(enablechecker) {
				this.omegga.getPlayer(player.id).setTeam(1);
				this.omegga.getPlayer(player.id).giveItem(weapons[invn.selected[0]]);
				this.omegga.getPlayer(player.id).giveItem(weapons[invn.selected[1]]);
				this.omegga.getPlayer(player.id).giveItem(weapons['rocket jumper']);
			}
			else {
				this.omegga.getPlayer(player.id).setTeam(0);
			}
			if(invn.base.length > 0) {
				const joinedpos = (invn.base).join(' ');
				this.omegga.writeln('Chat.Command /TP '+player.name+' ' +joinedpos+' 0');
			}
		})
		.on('cmd:setspawn', async name => {
			const haskey = await this.store.keys();
			const player = await this.omegga.getPlayer(name);
			let trust = await this.store.get("Trusted");
			if(haskey.includes(player.id)) {
				const pos = await this.omegga.getPlayer(name).getPosition();
				const cores = basecores.filter(brick => brick.components.BCD_Interact.ConsoleTag.indexOf(name) === -1 && Math.sqrt(
				(pos[0] - brick.position[0]) * (pos[0] - brick.position[0]) +
				(pos[1] - brick.position[1]) * (pos[1] - brick.position[1]) +
				(pos[2] - brick.position[2]) * (pos[2] - brick.position[2])
				) < 1280);
				if(cores.length > 0) {
					let canset = false;
					for(var cr in cores){
						const core = cores[cr].components.BCD_Interact.ConsoleTag;
						for(var trs in trust) {
							const trusted = trust[trs];
							if(trusted.player === core && trusted.trusts === name) {
								canset = true;
							}
						}
					}
					if(!canset) {
						this.omegga.whisper(name, clr.red + '<b>You cannot set spawn near base cores.</>');
						return;
					}
				}
				let invnt = await this.store.get(player.id);
				invnt.base = [Math.floor(pos[0]),Math.floor(pos[1]),Math.floor(pos[2])];
				this.store.set(player.id,invnt);
				this.omegga.whisper(name,clr.ylw+"<b>Base spawn has been set.</>");
			}
		})
		.on('cmd:clearspawn', async name => {
			const haskey = await this.store.keys();
			const player = await this.omegga.getPlayer(name);
			if(haskey.includes(player.id)) {
				let invnt = await this.store.get(player.id);
				invnt.base = [];
				this.store.set(player.id,invnt);
				this.omegga.whisper(name,clr.ylw+"<b>Base spawn has been cleared.</>");
			}
		})
		.on('cmd:listshop', async (name, ...args) => {
			const page = Math.abs(args[1]);
			if(isNaN(page)) {
				this.omegga.whisper(name, clr.red + '<b>You need to input page number..</>');
				return;
			}
			switch (args[0])
			{
				case 'weapons':
					this.omegga.whisper(name, "<b>Weapons --------------" + clr.end);
					for(var w=page * 8;w<shoplist.length && w < (page + 1) * 8;w++) {
						this.omegga.whisper(name,'<b>' + clr.orn + shoplist[w].weapon + '</color>: ' + clr.ylw + '$' + clr.dgrn + shoplist[w].price + '</>');
					}
					this.omegga.whisper(name, clr.ylw + "<b>PGup n PGdn to scroll." + clr.end);
					break;
				case 'machines':
					this.omegga.whisper(name, "<b>Machines --------------" + clr.end);
					for(var mcn=page * 8;mcn<machines.length && mcn < (page + 1) * 8;mcn++) {
						const data = machines[mcn].data.ConsoleTag.split(' ');
						if(!data.includes('Manual')) {
							switch(data[0]) {
								case 'Printer':
									this.omegga.whisper(name, '<b>' + clr.dgrn + machines[mcn].name + '</color>: ' + clr.ylw + '$' + clr.dgrn + data[3] + clr.slv + ' uses: ' + clr.cyn + data[5] + 'Eu ' + clr.slv + 'produces: ' + clr.ylw + '$' + clr.dgrn + data[4] + '</>');
									break;
								case 'Gen':
									this.omegga.whisper(name, '<b>' + clr.orn + machines[mcn].name + '</color>: ' + clr.ylw + '$' + clr.dgrn + data[3] + clr.slv + ' produces: ' + clr.cyn + data[4] + 'Eu</>');
									break;
								case 'Str':
									this.omegga.whisper(name, '<b>' + clr.red + machines[mcn].name + '</color>: ' + clr.ylw + '$' + clr.dgrn + data[3] + clr.slv + ' damage: ' + clr.red + data[4] + clr.slv + ' bullets-per-sec: ' + clr.orn + data[2] + clr.slv + ' range: ' + clr.ylw + data[5] + ' studs' + clr.slv + ' uses: ' + clr.cyn + data[6] + 'Eu</>');
									break;
							}
						}
					}
					this.omegga.whisper(name, clr.ylw + "<b>PGup n PGdn to scroll." + clr.end);
					break;
				default:
					this.omegga.whisper(name, clr.red + '<b>You need to input if you want to show weapons or machines.</>');
					break;
			}
		})
		.on('cmd:loadout', async (name, ...args) => {
			const haskey = await this.store.keys();
			const player = await this.omegga.getPlayer(name);
			if(haskey.includes(player.id)) {
				const slot = args[0];
				if(slot > 2) {
					this.omegga.whisper(name,clr.red + '<b>You have only 2 slots.</>');
					return;
				}
				if(slot < 1) {
					this.omegga.whisper(name,clr.red + '<b>There is no zero or negative slots.</>');
					return;
				}
				args.splice(0,1);
				const weapon = args.join(' ');
				let inv = await this.store.get(player.id);
				if(inv.inv.includes(weapon)) {
					this.omegga.getPlayer(player.id).takeItem(weapons[inv.selected[0]]);
					this.omegga.getPlayer(player.id).takeItem(weapons[inv.selected[1]]);
					this.omegga.getPlayer(player.id).takeItem(weapons['rocket jumper']);
					inv.selected[slot - 1] = weapon;
					if(enablechecker) {
						this.omegga.getPlayer(player.id).giveItem(weapons[inv.selected[0]]);
						this.omegga.getPlayer(player.id).giveItem(weapons[inv.selected[1]]);
						this.omegga.getPlayer(player.id).giveItem(weapons['rocket jumper']);
					}
					this.store.set(player.id,inv);
					if(todie.includes(name) && !inv.selected.includes(weapon)) {
						todie.splice(todie.indexOf(name), 1);
					}
					this.omegga.whisper(name,'<b>Slot '+clr.ylw+slot+'</color> has been set to '+clr.orn+weapon+'</color>.</>');
				}
				else {
					this.omegga.whisper(name, clr.red+'<b>You don\'t have that weapon.</>')
				}
			}
		})
		.on('cmd:basewars', async (name, ...args) => {
			const arg = args.join(' ');
			this.omegga.whisper(name, '<size="50"><b>' + clr.red + 'Base wars</> -----------------</>');
			switch(arg) {
				default:
					this.omegga.whisper(name, '<b>' + clr.grn + '/basewars</color> you are here.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/basewars how to play</color> basics to Base wars.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/basewars commands</color> commands for Base wars.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/basewars machines</color> info about machines in Base wars.</>');
					break;
				case 'how to play':
					this.omegga.whisper(name, '<size="30"><b>How to play.</>');
					this.omegga.whisper(name, '<b>Welcome to Base wars! Where you build and destroy basses, if you are not aware already.</>');
					this.omegga.whisper(name, '<b>Each couple of minutes the modes get switched to fight mode and build mode.</>');
					this.omegga.whisper(name, '<b>Your goal is to build and defend machines which generate money. You can destroy other people\'s machines for money. With money you can buy more machines and better weapons to kill and destroy.</>');
					this.omegga.whisper(name, '<b>During build mode you can build... Obviously... During fight mode you can destroy each other\'s bases. Bases can ONLY be destroyed with explosives.</>');
					this.omegga.whisper(name, '<b>To begin making money place down a manual printer with /place manual printer . Machines only get checked everytime fight mode begins so if you place down any machines during fight mode they wont be detected.</>');
					break;
				case 'commands':
					this.omegga.whisper(name, '<size="30"><b>Commands.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/basewars</color> info about Base wars.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/viewinv</color> view your inventory.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/listshop (machines/weapons) (page number)</color> list machines/weapons.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/loadout (1 - 2) (weapon)</color> set your weapon slot.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/buy (machine/weapon name)</color> buy a machine/weapon.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/setspawn</color> set your base spawn.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/clearspawn</color> clears your base spawn.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/place (machine name)</color> place down a machine.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/refund </color>removes a machine that you are looking at. Refunded machines return 80% of their original price.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/placecore </color>places a core which prevents players from setting spawn at your base. You can ONLY place 1.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/removecore </color>removes a core.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/pay (money) (player)</color> gives a player money.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/skip</color> vote to skip the round.</>');
					this.omegga.whisper(name, '<b>' + clr.grn + '/trust (add/remove/nothing) (player name) </color> gives/removes/views trust. Trusted users will not be damaged by your turrets and will be able to set spawn within your base core.</>');
					break;
				case 'machines':
					this.omegga.whisper(name, '<size="30"><b>Machines.</>');
					this.omegga.whisper(name, '<b>There are 3 types of machines. Printers generate money. Generators generate energy for the printers.</>');
					this.omegga.whisper(name, '<b>Generators can only work within a radius of 50 studs from printers.</>');
					this.omegga.whisper(name, '<b>Upon being destroyed machines drop 80% of their original price as a money brick.</>');
 					this.omegga.whisper(name, '<b>Machines can ONLY generate money during fight mode and when you are online on the server.</>');
					this.omegga.whisper(name, '<b>Turrets kill players. All turrets consume energy like printers do. Turrets cannot shoot through walls.</>');
 					break;
			}
			this.omegga.whisper(name, clr.ylw + "<b>PGup n PGdn to scroll." + clr.end);
		})
		.on('cmd:viewinv', async name => {
			const player = await this.omegga.getPlayer(name);
			const keys = await this.store.keys();
			if(keys.includes(player.id)) {
				const inv = await this.store.get(player.id);
				const inventory = inv.inv;
				const machines = inv.machines;
				const loadout = inv.selected;
				this.omegga.whisper(name, "<b>Your inventory --------------" + clr.end);
				this.omegga.whisper(name,'<b>' + clr.ylw + inventory.join('</color>,</>\n<b>' + clr.ylw) + '</>');
				this.omegga.whisper(name,"<b>Money: " + clr.ylw + '$'  + clr.dgrn + inv.money + clr.end);
				this.omegga.whisper(name, "<b>" + clr.slv +"Current loadout: "  + clr.orn + '<b>' + loadout.join(', ') + clr.end);
				this.omegga.whisper(name,"<b>Machines:" + clr.end);
				this.omegga.whisper(name,'<b>' + clr.dgrn + machines.join('</color>,</>\n<b>' + clr.dgrn) + '</>');
				this.omegga.whisper(name, clr.ylw + "<b>PGup n PGdn to scroll." + clr.end);
			}
		})
		.on('cmd:wipeall', async name => {
			const host = await this.omegga.host;
			if(host.name !== name) {
				this.omegga.whisper(name,'You are not allowed to wipe everyone\'s progress.');
				return;
			}
			if(!allowerase) {
				allowerase = true;
				this.omegga.whisper(name, 'Are you sure you want to wipe all the progress? This will remove everyone\'s guns, money and base position. Type this again to confirm.')
			}
			else {
				allowerase = false;
				this.store.wipe();
				this.omegga.whisper(name, 'Everyone\'s progress has been wiped.')
			}
		});
		let cores = await this.omegga.getSaveData();
		if(cores != null) {
			cores = cores.bricks.filter(brick => 'BCD_Interact' in brick.components && cores.brick_owners[brick.owner_index - 1].name.indexOf('BaseCore') === 0);
			basecores = cores;
		}
		const players = await this.omegga.getPlayers();
		for(var pl in players) {
			online.push(players[pl].name);
		}
		ProjectileCheckInterval = setInterval(() => this.CheckProjectiles(enablechecker && online.length > 0),delay);
		CountDownInterval = setInterval(() => this.decrement(true),60000);
		skipnturretinterval = setInterval(() => this.skipdecrementnturrets(),1000);
		return { registeredCommands: ['wipeall','loadout','viewinv','setspawn','clearspawn','place','buy','listshop','basewars','refund','pay','changelog','placecore','removecore','skip','trust'] };
	}
	async pluginEvent(event, from, ...args) {
		if(event === 'spawn') {
			const player = args[0].player;
			const invn = await this.store.get(player.id);
			if(invn.base.length > 0) {
				const joinedpos = (invn.base).join(' ');
				this.omegga.writeln('Chat.Command /TP '+player.name+' ' +joinedpos+' 0');
			}
			if(enablechecker) {
				this.omegga.getPlayer(player.id).giveItem(weapons[invn.selected[0]]);
				this.omegga.getPlayer(player.id).giveItem(weapons[invn.selected[1]]);
				this.omegga.getPlayer(player.id).giveItem(weapons['rocket jumper']);
			}
		}
		if(event === 'death') {
			if(!enablechecker) {
				return;
			}
			const player = args[0].player;
			const invn = await this.store.get(player.id);
			for(var invwep in invn.selected) {
				const weps = shoplist.filter(wep => wep.weapon === invn.selected[invwep] && wep.price > 2000);
				if(weps.length > 0) {
					const deletewep = weps[0]
					invn.selected[invn.selected.indexOf(deletewep.weapon)] = 'pistol';
					invn.inv.splice(invn.inv.indexOf(deletewep.weapon), 1);
					this.store.set(player.id, invn);
					this.omegga.whisper(player.name, clr.red + "<b>You have lost your " + deletewep.weapon + ".</>");
				}
			}
		}
	}
	async stop() {
		const deathevents = await this.omegga.getPlugin('deathevents');
		if(deathevents) {
			console.log('Unsubbing...');
			deathevents.emitPlugin('unsubscribe');
		}
		clearInterval(ProjectileCheckInterval);
		clearInterval(CountDownInterval);
		clearInterval(skipnturretinterval);
	}
}
module.exports = Base_wars;
