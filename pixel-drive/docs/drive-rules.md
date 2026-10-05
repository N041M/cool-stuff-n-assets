# Rules for the drive

These rules cover the drive. The code is in `js/`.

Every change to the drive should be checked against this file. When a rule has to change, change it here first.

## 1. Camera and planes

1. There is one camera. It moves to the right at a speed `V` of 36 CSS px per second at the road. The car keeps that pace except in two places. On a rally stage it runs at 1.5 × `V` from the start arch and slows back after the finish. In a highway sprint it runs at 2.5 × `V`. The pace changes smoothly over about three seconds and never jumps.
2. The scene is split into planes. Each plane moves at `V` times its depth factor:

   | Plane    | Depth | Holds                                               |
   |----------|-------|-----------------------------------------------------|
   | sky      | 0     | sky, sun, moon and stars                            |
   | clouds   | 0.02  | clouds, which also drift with the wind              |
   | far      | 0.1   | the horizon: mountains, hills, plain or sea         |
   | middle   | 0.3   | the middle distance: villages, fields, towns, rail  |
   | roadside | 0.6   | everything along the far edge of the road           |
   | road     | 1.0   | the road, the car, traffic, arches over the road and the ground below it |

3. No plane has a speed of its own, and nothing inside a plane moves at a different speed from the rest of it. The ground below the road belongs to the road plane and moves with it as one piece.
4. A plane's content is fixed to the plane. A point at position `u` on plane `d` stands for the world position `X = u / d`, and it is drawn at `d × (X − camera) + c`, where `c` is the middle of the screen. The same world position therefore reaches the middle of the screen on every plane at the same moment. Far planes show what lies ahead before the road gets there.

## 2. Motion

1. Everything moves by fractions of a pixel and is drawn at the display's refresh rate. Positions are rounded to physical screen pixels, never to sprite pixels.
2. At the normal pace, nothing on screen moves left faster than 1.5 × `V` or right faster than 0.5 × `V`. Oncoming cars on the highway pass at up to 1.8 × `V`, and in a sprint or on a rally stage the scenery moves at the car's pace.
3. Rain falls at most 110 px per second and snow at most 25 px per second.
4. Nothing changes at random. Every change on screen is movement or a fade of at least 0.5 s.
5. Only real beacons and the car's indicators blink. Beacons pulse smoothly with a period of 2 s or more, and no more than three pulse at once. The indicators blink at 1.5 flashes a second, as real ones do, and only while the car signals a lane change.
6. Scenery does not sway, wobble or shimmer. Water shows highlights that stay fixed to the water.
7. Animation frames follow distance. Legs and wheels advance with distance travelled, so feet never slide. Idle animations hold each frame for at least half a second.
8. At most one event starts every 8 s. Events are planes, trains, flocks of birds, balloons and the UFO.
9. The camera never moves up or down. The car does, when it changes lane or rides over a bump.
10. The hero text sits on its own strips of the page colour, which keep it readable over the scene. The scene is not veiled behind it.

## 3. Light

1. The time of day is one continuous value. A visit starts at the visitor's local time, and a whole day then takes 10 minutes.
2. The sky is drawn on every frame. In the pixel look it is a smooth vertical gradient. In the character look every row of the scene has one flat tone, as in the first drive.
3. Colours come from key colours at set hours. The current colour is interpolated between the two nearest keys.
4. Pictures are recoloured when a colour has moved by two steps of 8-bit colour, two pictures per frame. A step that small cannot be seen.
5. Nothing reads the time of day through a threshold. Every light has its own switch-on and switch-off time and fades over about 2 s. Lamps come on one after another, and windows light and go dark one by one through the evening.
6. The sun and the moon rise and set behind the terrain.
7. Stars come out from dusk and fade in as the sky darkens, brightest first. They twinkle by changing brightness slowly. In the character look they are set in the page's cells as `·`, `+` and `✦`, about one sky cell in 45 at full night, as in the first drive.

## 4. Pictures

1. The drive is drawn as pixel art. The code also holds a character look in the style of the first drive, which `?drive=ascii` in the address shows. The page has no switch for it, and the rules below for the character look describe that code.
2. Underneath, every picture is pixel art. One sprite pixel is `P` CSS px: 5 on wide screens, 4 on medium ones and 3 on phones, or less when the window is short. The pixel look shows the pictures as they are. The character look reads the same pictures into characters.
3. The character look is the style of the first drive. Every row of the scene has one flat tone: the sky from its top down to the road, then the road, then the ground, fading into the page at the bottom. The tones are the first drive's colours for day, dusk and night on the light and the dark page. The page's dotted grid runs through the sky.
4. In the character look, scenery is read from the pixel pictures into cells of 7 × 14 CSS px, the size of the page's glyph field. The rows line up with the rows of the field, and each plane's columns move with the plane. A cell takes the material that covers most of it and is then drawn the way the first drive built its scene, as rule 6 lists. A near plane hides what is behind it cell by cell.
5. Characters come in three strengths, mixed 0%, 15% and 30% of the way toward their row's tone. The road and the roadside are full, the middle distance is one step fainter and the horizon two steps fainter. Outlines, slope tops, the horizon line and windows are one step stronger than the rest of their plane, so distant shapes stay defined while their hatching recedes.
   - After that mixing, a character is still at least 0.6, 0.5 or 0.4 lighter or darker than its row at each strength, pushed toward the page's ink where it is not. Pale walls, sand and snow darken on a pale sky, and dark ones lighten at night. People, animals and other solid blocks keep close to their own colours, with a floor of 0.12.
   - The inside of each mass has a wash of its own colour behind its characters: 38% for walls and roofs, 30% for trees, and 22% for land and water in the distance and for the football pitch. A family washes in one colour whatever its shading. The cells along a mass's edge are not washed, so its edges stay characters on the sky. The ground at the road has no wash.
6. Each cell is drawn the way the first drive built its scene:
   - Walls are box outlines (`┌ ─ ┐ │ └ ┘`) where they meet the sky or a gap. A wall that stands on something has no line under it. Windows are `□`, and lit windows and lamps are `■`. Near the road a wall is blank inside, and in the distance it is hatched with `/`. Brick is drawn in courses, logs in rows of `═─` and containers with ribs. Wall lines are mixed halfway toward the page's ink, so pale walls show on a pale sky.
   - Roofs have `/` and `\` down their sides, `^` at the ridge and `/` hatching or rows of slates inside. Where a roof's edge crosses a wall, such as along a gable, it is a line that leans the way the roof does.
   - Broadleaf trees are crowns of `@%&♣`, stronger inside than round the rim, with `•` apples on fruit trees. Trunks keep their width in blocks, and a trunk thinner than a quarter of a cell is a line.
   - Conifers have `/` and `\` down their sides, `▲` on top and `^` in every other cell inside. Forest that covers the ground in the distance has `▲` along its top and a scatter of `▲^♠` below that thins out further in.
   - Hills and mountains have a slope character along their top (`/ \ ^ _ -`), then hatching that follows the slope and thins out further down. Slopes that fall to the right are hatched with `\` and the rest more faintly with `/`. Snow is `░` just below the top, farmland is rows of field characters, sand is rows of `~` and mesas are rows of `─`.
   - Below the horizon, the land is a line along the horizon, then fields in rows, each field a run of one character. The sea is a line along the horizon, then short lines of swell. Where the coast comes near, the sea is a strip along the horizon with a line of sand under it.
   - Water in front of the road is a line along its top, then short lines of swell (`─ ═ - — ~ ≈`), more of them further out. Ice has cracks and drifts of snow.
   - The ground in front of the road is ferns and grass (`,;'"`), rows of crops with the odd flower, sand ripples, rocky ground or stones.
   - The road is drawn row by row from the route: an edge on top, specks, dashes along the middle, and at the bottom a kerb, a barrier, cobbles or a verge, depending on the surface. A joint `╪ ┃` crosses the road where one surface meets the next, and a chequered line where a rally stage starts or ends.
   - The fence along the roadside is one row just above the road: `┼─` for picket and rail fences, `┄` for tape, `╤═` for crash barriers, `┬─` for railings, `═╩` for stone walls, and red and white poles in winter.
   - Posts, poles and masts are line characters. Power pylons are a lattice of legs that lean with them, cross arms of `─` and `╳` between the legs.
   - The football pitch is a plain green wash with its lines drawn in line characters: `─` along the touchlines, `│` down the halfway line, `═` where two lines share a row and slope characters round the centre circle. Its players and officials keep the colours of their kits.
   - The legs of the rally arches are `║` striped yellow and dark, and the finish banner has a row of `▚▞` chequer above and below its name.
   - Signs are panels of whole cells in the sign's colour, with their text in real characters. Light signs are framed in ink (`┌─┐ │ └─┘`), and the sign at the end of a town has a red bar of `╱` across it. Letters on anything else are set in ink.
   - People, animals, palms, hay bales and boats are drawn in quarter blocks in their own colours. Where a cell of a person or an animal holds two colours, the quarters of one are a quarter block over a fill of the other, so a face shows under its hair.
   - Clouds are the first drive's: patches of a noise field twice as wide as they are tall, drawn in ink, `■■■▪═■` where they are thick, `=+□▪≈=` further out and `-:·.'-` at their edges and base, with holes, ragged streaks and the odd digit. The pixel look keeps rounded clouds.
   - The sun is the first drive's: a disc of quarter blocks 20 CSS px in radius on a 1200 px wide window, growing toward dusk, in its sun colour. When it is low it turns to the dusk colour and its lower half is striped. It has no glow.
   - The moon is the first drive's crescent: a disc 15 CSS px in radius on a 1200 px wide window, less a smaller disc set up and to its right, set in the page's cells in quarter blocks. It is pale yellow on dark rows and ochre on light ones, and has no glow. The pixel look keeps the moon's phase and glow.
   - The moon lays a path on the distant sea, as in the first drive: `─` in the moon's colour in some of the cells below it, `═` along the middle, in a band that widens toward the road. The lines belong to the water, so they drift through the path and fade in and out at its edges. The pixel look draws the same path as short streaks.
   - Wind turbines stand in the middle distance, in farms of two to four on open fields and meadow in the lowland and the hills: a white tower 30 to 38 px tall that tapers from two pixels to one, a nacelle and a hub, and blades a little over half the tower's height, two pixels wide near the hub. In the character look each blade is a line of characters from the hub to its tip, one per row where it is steep (`│ / \`) and `─` along the columns with a slash at each step where it is shallow, round a `+` hub on a `│` tower.
   - The airliner is two rows of characters: the fuselage between two lines of `_`, a `<` or `>` nose, a `/|` tail fin and a row of `·` windows. By day it trails a dashed contrail. At night its body fades, its windows glow and it shows a red light on the wing and a white strobe on the fin.
7. The car and the traffic are pixel sprites in both looks.
8. Size follows depth. The road plane is 10 sprite pixels per metre, which makes the car about 4 m long. The roadside plane is 6 px per metre and the middle plane 3.
9. The far plane is a backdrop kilometres away and has its own scale of 0.05 px per metre. Landmarks on it may be drawn up to three times larger than true scale, so their shape reads.
10. In the pixel look all colours come from one list of materials. A material has one colour at noon, and the light, the weather and the distance recolour it the same way everywhere. The character look uses the same materials through a colour table of its own, which only half dims them at night because the rows behind them carry the darkness.
11. In the pixel look, distance is a tint toward the colour of the horizon: 45% on the far plane, 18% on the middle plane and 5% on the roadside. Fog and haze add to it.
12. Light comes from above. Each material has a lit tone and a shaded tone, and shading is drawn into the art. Vehicles have a dark outline.
13. A person's head has a shape: hair on top, the back of the head, a face with an eye in profile or two from the front. Heads follow the fashions of the time: mostly short hair, some long hair falling to the shoulders, the odd bald head with a grey fringe, flat caps with a brim, headscarves and the odd moustache.

## 5. Places and the route

1. The route has no fixed order. It is generated as the car drives and differs on every visit.
2. Places are grouped into regions:

   | Region    | Places                                  | Horizon                    |
   |-----------|-----------------------------------------|----------------------------|
   | coast     | city, highway, bridge, shore            | open sea                   |
   | lowland   | city, highway, farmland, village        | low hills                  |
   | hills     | farmland, village, forest, rally stage  | rolling hills, Ještěd      |
   | dry       | highway, desert, rally stage            | mesas                      |
   | mountains | forest, mountain pass, winter valley    | high peaks                 |

3. A place is followed only by one of its allowed neighbours. The next place is picked at random, with places seen recently made less likely.
4. A place lasts between 55 and 100 s at the road, and a region between 3 and 6 minutes.
5. Places merge through their numbers. Tree density, building density, hill height, water and crop share blend over a third of a place's length. Objects are picked by these numbers, so the land between two places has a bit of both. Nothing changes along a straight line down the screen. On the horizon, the coast is a line across the land: coming to the coast, the sea first shows as a strip along the horizon and widens toward the road as the coast comes nearer, with a line of sand where it meets the land, as in the first drive.
6. The road surface changes at one point, at a joint or a painted line.
7. Some pairs of places have a landmark at the change, such as a town sign, the fuel station or the rally start. A landmark appears on most crossings, and the rally stage always starts and ends at its arches. No landmark stands on the football pitch. The arches stand across the road where the surface changes, with one leg on each edge of the road. The far leg, on the left, is drawn behind all the traffic, and the near leg, on the right, and the banner in front of the car, which drives between the legs. The STOP board stands on the roadside about 15 m past the finish.

## 6. Generation

1. Every plane is generated just past its right edge and then stays fixed until it leaves on the left. Nothing is created, removed or changed inside the visible part of a plane. The one exception is a window that is made wider, where the new strip is filled at once.
2. Objects are built from parts. A house picks its width, floors, walls, roof, door, windows, chimney and extras. Trees pick species, size and crown. Vehicles pick body, colour and load.
3. Some objects come as small scenes that belong together, such as a farmyard, a bus stop with people waiting, or road works.
4. Spacing is random and clustered. Only things that are regular in reality are placed at regular spacing: lamp posts, fence posts, pylons and road markings.
5. The generator remembers the last few minutes and avoids repeating a combination or a scene.
6. Rare events have a low chance and a long cooldown.
7. The route, the time of day and the weather each run on their own clock.
8. The seed of a visit can be read as `Drive.seed` in the console and set with `?seed=` in the address. For checking the art, `Drive.jump({ place, hour, weather })` jumps to a place, an hour and a weather.

## 7. Moving objects

1. A moving object appears only where it could in 3D. It can enter at a screen edge, come out from behind something that hides it, or come out of fog.
2. A moving object never leaves the place it belongs to while it is on screen. A train only starts when its rails reach past both edges of the screen for the whole of its run. A boat only starts when there is water along its whole path. A car only starts when its lane stays open to traffic until it has left the screen.
3. An object that changes state fades or animates. Nothing swaps in place.

## 8. Weather

1. Weather is a handful of numbers: cloud cover, precipitation, temperature, wind, fog, how wet the ground is and how much snow lies on it. Each number changes slowly toward a target.
2. A place sets only a climate: a base temperature, how likely rain is, how foggy it gets and the colour of its haze. When the route changes place, the weather drifts toward the new climate.
3. Precipitation takes its type from temperature. Below 0 °C it is snow, between 0 and 2 °C it is sleet and above that it is rain.
4. Every picture responds through the same channels:
   - Cloud cover dims the light and takes out colour.
   - Fog and haze strengthen the distance tint, so far planes fade first.
   - Rain and snow fall on three layers at different depths, and each layer drifts sideways with its plane and the wind.
   - A wet road darkens and reflects lights.
   - Snow settles on everything with open sky above it, so any picture gets snow on its roofs, branches and fences. Ground turns white.
5. Snow builds up over minutes and melts slowly, and the road dries slowly. A change of place does not reset either.
6. In rain and fog, cars drive with their lights on, fewer people are out and birds stay on the ground.
7. There are no lightning flashes.

## 9. The car

1. The car drives in the near lane. When a slower vehicle ahead is about 2 s away, the car eases up into the far lane over about a second, passes, and eases back once the vehicle is a safe gap behind.
2. The traffic is planned so the far lane is free during every overtake. Vehicles in the same lane never catch up with each other on screen. On the highway some cars come the other way in the far lane, facing left with their lights toward the car. None come during an overtake or a sprint.
3. Once per stretch of highway there is a sprint. No more traffic joins and the car waits for a clear road. Then four to six slow vehicles appear ahead in alternating lanes, spaced so the car can pass each in turn. The car speeds up to two and a half times its pace and weaves through them, changing lane in under half a second whenever the lane ahead is blocked and the other is clear. When the last of them is behind the car, the pace eases back.
4. A rally stage is a dirt and sand track with no other traffic. It bends: seen from the side, the track swings toward the viewer and back, lying up to 6 sprite px lower in a bend, with rough ground above it. In the character look a bend moves the road down one row, with a pale sand shoulder in the row above and `\` or `/` on its edges where it steps. The first and last 110 px of the stage are level, so the arches stand on a straight road. The car follows the bends, and so do the rocks that lie on the track now and then, in either lane, 50 to 95 px apart. The car moves a little way toward the far lane to pass one in its lane.
5. The car rides over bumps that are fixed to the road surface. The front wheel reaches a bump first and the rear wheel a moment later. Gravel has many bumps and the highway almost none.
6. Dust comes from the surface under the rear wheel. The surface decides how much, what colour and what kind: sand, dirt dust with stones, snow spray or water spray. On a rally stage the cloud is large: dense, long-lived and spreading wide behind the car. Once in the air, dust stays where it was released and drifts, rises, spreads and fades.
7. Clicking the car makes it hop. The car has amber indicators on its front and rear corners. It signals for about a second before it pulls out to overtake and before it pulls back in, and all through every lane change when it weaves in a sprint or around rocks.
8. Every vehicle has its dipped headlights on all day, as the law in Czechia asks. The beams show whenever it is dark around the road: at night, in fog or rain, and on the dark page. A beam is a cone of light that nods with the car as its front wheel rides over a bump. In the character look it is fainter and holds characters on the page's rows, `═` and `=` close to the lamp, then `-` and `·` that thin out toward the edges and the far end. The characters stay with the road, so the lit road streams through the beam as the car drives. Rain and snow show in a beam as they do in real headlights: drops hang at fixed places in the air, fall at the weather's speed and are lit by as much of the beam as reaches them.

## 10. Special scenes

### The football pitch

The pitch is a nod to a referee from the years of communist Czechoslovakia.

1. It appears on most visits within the first few minutes, in a village or farmland place, and now and then after that.
2. It is a small village ground: a railing with spectators, a clubhouse, wooden benches, two floodlights and a scoreboard of wooden number plates under DOMÁCÍ and HOSTÉ. There are no advertising boards, no names and no political symbols.
3. The referee and the linesman wear the black kit with a white collar that referees wore until the early 1990s. The referee has a whistle, a watch and a notebook.
4. The players wear light kits with black armbands.
5. Each time the pitch passes, one moment is chosen and timed to happen near the middle of the screen:
   - a minute's silence, with both teams and the officials lined up across the middle of the pitch, facing the road with heads bowed, until the referee's whistle
   - a foul, the whistle, the yellow card and the notebook
   - a free kick, with an arm pointing the direction
   - an indirect free kick, with an arm held up until the ball is played
   - offside, with the linesman's flag and the referee's arm raised
   - a penalty, with the referee pointing to the spot
   - the end of the match, with a look at the watch and the final whistle
6. The minute's silence is chosen for half of the first pitches of a visit and a fifth of the later ones.
7. Every pose is held for at least a second.
8. In the evening and at night the floodlights are on. When snow lies on the pitch, the lines disappear and the ball is orange.

### Ještěd

1. Ještěd stands on the far plane in the hills region. It appears on about a third of the passes through that region and at most once a visit.
2. The tower is drawn about three times its true size against the ridge. Its ring of windows lights up at night and the beacons on its mast pulse.
3. The two cabins of the cable car travel up and down the slope.
4. A brown tourist sign reading JEŠTĚD stands by the road before the mountain comes into view.

### The UFO

1. The UFO appears at most once a visit, at night, when the air is clear.
2. It comes down out of the sky over a pasture on the middle plane, hovers, and slowly lifts one cow in a soft beam of light. Then it rises out of view the way it came.
3. It moves slowly and eases into every movement. Its rim lights cycle at most once a second.
4. Clicking it sends it away.

## 11. Page and accessibility

1. The drive fades into the plot as the page scrolls, cell by cell, as before.
2. The scene follows the page theme. On the dark page it is darker overall, and lights keep their brightness.
3. When the system asks for reduced motion, the drive shows one still picture, generated fresh for each visit.
