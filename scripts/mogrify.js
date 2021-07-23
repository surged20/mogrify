function doActorArt(actor, img) {
  // Apply img path regex
  if (CONFIG.JANITOR.mogrifyData[actor.type]) {
    const type = CONFIG.JANITOR.mogrifyData[actor.type];
    if (type?.art)
      img = img.replace(RegExp(type.art.regex), type.art.string);
  }

  return img;
}

function doActorToken(actor, img) {
  // Apply img path regex
  if (CONFIG.JANITOR.mogrifyData[actor.type]) {
    const type = CONFIG.JANITOR.mogrifyData[actor.type];
    if (type?.token)
      img = img.replace(RegExp(type.token.regex), type.token.string);
  }

  return img;
}

function doItemsAdd(actor) {
  if (CONFIG.JANITOR.mogrifyData[actor.type]) {
    const type = CONFIG.JANITOR.mogrifyData[actor.type];
    if (type?.addItem) {
      type.addItem.forEach(e => {
        if (e.actorNames.includes(actor.name)) {
          const item = game.items.find(i => i.name === e.itemName && i.type === e.itemType);
          if (item) {
            const itemData = item.toObject();
            if (e?.data)
              e.data.forEach(p => foundry.utils.setProperty(itemData, p.prop, p.value));
            Item.create(itemData, {parent: actor});
          }
        }
      });
    }
  }
}

function doItemRemove(actor, item) {
  if (CONFIG.JANITOR.mogrifyData[actor.type]) {
    const type = CONFIG.JANITOR.mogrifyData[actor.type];
    if (type?.removeAllItems && type?.removeAllItems.includes(item.name)) {
      item.delete();
      return true;
    }
  }
  return false;
}

// Capitalize first letter in p1 and replace in match
function capP1(match, p1, p2, p3, offset, string) {
  return match.replace(p1, p1[0].toUpperCase() + p1.substring(1));
}

function doEntityRegexes(entity, desc) {
  // Apply per-type regexes to text
  if (CONFIG.JANITOR.mogrifyData[entity.type]) {
    const typeData = CONFIG.JANITOR.mogrifyData[entity.type];
    if (typeData?.regexes) {
      typeData.regexes.forEach(e => {
        if (e?.global)
          if (e?.cap)
            desc = desc.replaceAll(RegExp(e.regex, 'g'), capP1);
          else
            desc = desc.replaceAll(RegExp(e.regex, 'g'), e.string);
        else
          desc = desc.replace(RegExp(e.regex), e.string);
      });
    }
  }

  if (CONFIG.JANITOR.mogrifyData["all"]) {
    const typeData = CONFIG.JANITOR.mogrifyData["all"];
    if (typeData?.regexes) {
      // Apply "all" regexes to text
      typeData.regexes.forEach(e => {
        if (e?.global) {
          desc = desc.replaceAll(RegExp(e.regex, 'g'), e.string);
        }
        else
          desc = desc.replace(RegExp(e.regex), e.string);
      });
    }
  }

  return desc;
}

function removeEntityFlags(entity) {
  if (CONFIG.JANITOR.mogrifyData["all"]) {
    const typeData = CONFIG.JANITOR.mogrifyData["all"];
    if (typeData?.removeFlags)
      typeData.removeFlags.forEach(async scope => await entity.update({ [`flags.-=${scope}`] : null }));
  }
}

async function updateActorData(actor) {
  if (!CONFIG.JANITOR.mogrifyData[actor.type])
    return;
  const type = CONFIG.JANITOR.mogrifyData[actor.type];

  if (type?.data) {
    type.data.forEach(e => {
      if (e.actorNames.includes(actor.name)) {
        e.data.forEach(async p => await actor.update({[`${p.prop}`]: p.value}));
      }
    });
  }
}

async function updateItemData(item) {
  if (!CONFIG.JANITOR.mogrifyData[item.type])
    return;
  const type = CONFIG.JANITOR.mogrifyData[item.type];

  const data = type.data?.find(entry => entry.name === item.name);
  if (data) {
    await item.update({[`${data.prop}`]: data.value});
  }
}

async function updateItemIcon(item) {
  if (!CONFIG.JANITOR.mogrifyData[item.type])
    return;
  const type = CONFIG.JANITOR.mogrifyData[item.type];
  let img = (type?.defaultIcon) ? type.defaultIcon : null;


  const match = type.icons?.find(entry => entry.name === item.name);
  if (match)
    img = match.img;

  if (img)
    await item.update({"img": img});
}

async function loadMogrifyData(filePath) {
  return await fetch(filePath)
    .then(response => {
      if (!response.ok)
        return Promise.reject(response);
      return response.json()
    })
    .then(data => CONFIG["JANITOR"] = {"mogrifyData": data})
    .catch((error) => {
      ui.notifications.error("mogrify: cannot parse json data");
      console.error("mogrify: " + error);
    });
}

async function processItem(item) {
  let desc = item.data.data.description.value;

  removeEntityFlags(item);
  updateItemData(item);
  updateItemIcon(item);
  desc = doEntityRegexes(item, desc);

  await item.update({"data.description.value": desc});
}

async function processActor(actor) {

  removeEntityFlags(actor);
  updateActorData(actor);
  doItemsAdd(actor);

  actor.items.forEach(item => {
    if (!doItemRemove(actor, item))
      processItem(item);
  })

  let desc = actor.data.data.details.biography.value;
  let artImg = actor.data.img;
  let tokenImg = actor.data.token.img;

  artImg = doActorArt(actor, artImg);
  tokenImg = doActorToken(actor, tokenImg);
  desc = doEntityRegexes(actor, desc);

  await actor.update({
    "data.details.biography.value": desc,
    "img": artImg,
    "token.img": tokenImg
  });
}

function processJournal(journal) {
  let content = journal.data.content;

  content = doEntityRegexes(journal, content);
  console.log(content);

  journal.update({"content": content});
}

function processItemFolder(folder) {
  folder.children.forEach(folder => processItemFolder(folder));
  folder.content.forEach(item => processItem(item));
};

function processActorFolder(folder) {
  folder.children.forEach(folder => processActorFolder(folder));
  folder.content.forEach(actor => processActor(actor));
};

function processJournalFolder(folder) {
  folder.children.forEach(folder => processJournalFolder(folder));
  folder.content.forEach(journal => processJournal(journal));
};

Hooks.on("init", function() {
  console.log("mogrify | Initializing mogrify content update tool");

  game.settings.register('mogrify', "mogrifyDataFile", {
    name: "Data file",
    hint: "Path to the data file",
    scope: "world",
    config: true,
    type: String,
    default: "modules/mogrify/examples/sjmais.json",
    filePicker: true,
  });

  Hooks.on("getItemDirectoryFolderContext", async (html, options) => {
    options.push( 
      {
        name : "Mogrify Folder",
        condition: true,
        icon: '<i class="fa fa-broom"></i>',
        callback: async header => {
          const result = await loadMogrifyData(game.settings.get('mogrify', 'mogrifyDataFile'));
          if (!result) return;
          const li = header.parent();                                                                            
          const folder = game.folders.get(li.data("folderId"));
          processItemFolder(folder);
        }
      })
  });

  Hooks.on("getItemDirectoryEntryContext", async (html, options) => {
    options.push( 
      {
        name : "Mogrify",
        condition: true,
        icon: '<i class="fa fa-broom"></i>',
        callback: async target => {
          const result = await loadMogrifyData(game.settings.get('mogrify', 'mogrifyDataFile'));
          if (!result) return;
          const item = game.items.get(target.attr('data-entity-id'));
          processItem(item);
        }
      })
  });

  Hooks.on("getActorDirectoryFolderContext", async (html, options) => {
    options.push( 
      {
        name : "Mogrify Folder",
        condition: true,
        icon: '<i class="fa fa-broom"></i>',
        callback: async header  => {
          const result = await loadMogrifyData(game.settings.get('mogrify', 'mogrifyDataFile'));
          if (!result) return;
          const li = header.parent();                                                                            
          const folder = game.folders.get(li.data("folderId"));
          processActorFolder(folder);
        }
      })
  });

  Hooks.on("getActorDirectoryEntryContext", async (html, options) => {
    options.push( 
      {
        name : "Mogrify",
        condition: true,
        icon: '<i class="fa fa-broom"></i>',
        callback: async target => {
          const result = await loadMogrifyData(game.settings.get('mogrify', 'mogrifyDataFile'));
          if (!result) return;
          const actor = game.actors.get(target.attr('data-entity-id'));
          processActor(actor);
        }
      })
  });

  Hooks.on("getJournalDirectoryFolderContext", async (html, options) => {
    options.push( 
      {
        name : "Mogrify Folder",
        condition: true,
        icon: '<i class="fa fa-broom"></i>',
        callback: async header => {
          const result = await loadMogrifyData(game.settings.get('mogrify', 'mogrifyDataFile'));
          if (!result) return;
          const li = header.parent();                                                                            
          const folder = game.folders.get(li.data("folderId"));
          processJournalFolder(folder);
        }
      })
  });

  Hooks.on("getJournalDirectoryEntryContext", async (html, options) => {
    options.push( 
      {
        name : "Mogrify",
        condition: true,
        icon: '<i class="fa fa-broom"></i>',
        callback: async target => {
          const result = await loadMogrifyData(game.settings.get('mogrify', 'mogrifyDataFile'));
          if (!result) return;
          const journal = game.journal.get(target.attr('data-entity-id'));
          processJournal(journal);
        }
      })
  });

});
