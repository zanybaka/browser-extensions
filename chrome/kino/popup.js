function getActiveTab(callback) {
  var queryInfo = {
    active: true,
    currentWindow: true
  };

  chrome.tabs.query(queryInfo, (tabs) => {
    var tab = tabs[0];

    var url = tab.url;

    console.assert(typeof url == 'string', 'tab.url should be a string');

    callback(tab);
  });
}

function findElementByText(selector, text) {
  var elements = document.querySelectorAll(selector);
  return Array.prototype.filter.call(elements, function(element){
    var result = RegExp(text, 'u').test(element.textContent);
    return result;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  getActiveTab((tab) => {
  	var kinoestet_navigate = document.getElementById('kinoestet_navigate');
  	var kinoestet_parse = document.getElementById('kinoestet_parse');
  	var kinopoisk_import = document.getElementById('kinopoisk_import');
  	
  	if (tab.url.includes('kinopoisk.ru'))
  	{
  		// import here
  		kinoestet_navigate.innerText = '';
  		kinoestet_parse.innerText = '';
        readViewedMoviesFromStorage();
  	}
  	else
  	{
  		kinopoisk_import.innerText = '';
  		if (/^.*kinoestet.ru\/user\/\d+\/viewed/.test(tab.url))
  		{
  			// startParsing here
  			kinoestet_navigate.innerText = '';
  			startParsing(tab);
  		}
  		else
  		{
  			// navigate here
  			kinoestet_parse.innerText = '';
    		navigate();
    	}
    }
  });
});

function navigate() {
	var input_url = document.getElementById('input_url');
    
    input_url.addEventListener('click', () => {
  	    input_url.select();
  	    input_url.setSelectionRange(0, input_url.value.length);
  	});
    
 	var go_btn = document.getElementById('go_btn');
	go_btn.addEventListener('click', () => {
		chrome.tabs.create({
    		url: input_url.value
  		});      			
   	});
}

function startParsing(tab) {
	var pages2parse = document.getElementById('pages2parse');
	var go_btn = document.getElementById('go_btn');
    const scriptToExec = `${findElementByText} (${parsePagesCount})()`;
    chrome.tabs.executeScript(
        {
            code: scriptToExec
        }, (result) =>
        {
            var pages = Number(result);

            if (Number.isFinite(pages) && pages > 0)
            {
                pages2parse.innerText=pages;
                go_btn.addEventListener('click', () => {
                    startParsingViewedMovies(tab, pages);
                });
            } else
            {
                pages2parse.innerText='0, nothing to startParsing';
                go_btn.style = 'display: none';
            }
        }
    );
}

function startParsingViewedMovies(tab, moviesCount) {
    console.log('active tab url is ' + tab.url);
    console.log('pages:');
    var initial = `${tab.url.match(/(.*\/viewed)(\?p=\d+)?/)[1]}`;
    let movies = [];
    for (var i = 0; i <= moviesCount; i++) {
        var url = initial + (i === 0 ? '' : `?p=${i}`);
        console.log(`page[${i}]=${url}`);
        getPageContent(url)
            .then(content => {
                var parser = new DOMParser();
                var doc = parser.parseFromString(content, "text/html");
                var parsed = parseViewedMovies(doc);
                movies = movies.concat(parsed);
            }, state => {
                alert(`Can't download ${url}: ${state}`);
                return;
            })
            .then(() => {
                saveToLocalStorage(movies); // TODO: do not save after each page
            });
    }
}

function readViewedMoviesFromStorage() {
    chrome.storage.local.get( 'movies', (result) => {
        var movies = JSON.parse(result.movies);
        var moviesInStorage = document.getElementById('moviesInStorage');
        var go_btn = document.getElementById('go_btn');
        moviesInStorage.innerText = movies.length;
        go_btn.addEventListener('click', () => {
            var script = `${enterMovieName} ${clickOnFirstMenu} ${enterMark} (${startImportingViewedMovies})(${result.movies})`;
            chrome.tabs.executeScript(
                {
                    code: script
                }, () =>
                {

                }
            );
        });
    });
}

function startImportingViewedMovies(movies) {
    var input = document.querySelector('input.ui-autocomplete-input');
    enterMovieName(input, movies, 0, null);
}

function enterMovieName(input, movies, index, filmId) {
    // if (index === 10) return;
    if (movies.length === index) return;
    const movie = movies[index];
    input.value = `${movie.en ? movie.en : movie.ru} ${movie.year}`;
    input.dispatchEvent(new Event('keydown', { '': true }));
    clickOnFirstMenu(input, movies, index, filmId);
}

function clickOnFirstMenu(input, movies, index, filmId) {
    var list = document.querySelector('ul.ui-autocomplete');
    if(list.style.display !== 'block') {
        window.setTimeout(() => clickOnFirstMenu(input, movies, index, filmId), 500);
        return;
    }
    var firstItem = list ? list.querySelector('li.ui-menu-item') : null;
    if (firstItem) {
        firstItem.click();
        window.setTimeout(() => enterMark(input, movies, index, filmId), 500);
        return;
    }
    firstItem = list.querySelector('li');
    var exists = firstItem && firstItem.querySelector('div.existFilm');
    if (exists) {
        console.log(`Film ${movies[index].en} already exists.`);
        input.dispatchEvent(new Event('keydown', { keyCode: 27 }));
        window.setTimeout(() => enterMovieName(input, movies, ++index, filmId), 500);
    } else {
        window.setTimeout(() => clickOnFirstMenu(input, movies, index, filmId), 500);
    }
}

function enterMark(input, movies, index, filmId) {
    let itemList = document.getElementById('itemList');
    let lis = itemList.querySelectorAll('li');
    var newFilm = (lis && lis.length) ? lis[0].id : null;
    var newFilmId = newFilm ? newFilm.match(/film_(\d+)/)[1] : null;
    if (!newFilmId || newFilmId === filmId) {
        window.setTimeout(() => enterMark(input, movies, index, filmId), 500);
    } else {
        var actions = document.querySelector(`div.rateNow.rateNow${newFilmId}`).querySelectorAll('div.rateNowItem');
        // click 'seen' action
        actions[0].click();
        // click 'mark', [1] = 10, [10] = 1;
        var mark = Number(movies[index].mark);
        if (Number.isFinite(mark)) {
            mark = Math.floor(2 * mark);
            if (mark >= 1 && mark <= 10) {
                actions[11 - mark].click();
            }
        }
        enterMovieName(input, movies, ++index, newFilmId);
    }
}

function saveToLocalStorage(movies) {
    chrome.storage.local.set( { 'movies': JSON.stringify(movies)});
    // alert('Done. Saved to storage.');
    chrome.tabs.update({ url: 'https://www.kinopoisk.ru/mykp/movies/list/type/355332/' });
}

function getPageContent(url) {
    return new Promise((resolve, reject) => {
        var request = makeHttpObject();
        request.open("GET", url, true);
        request.send(null);
        request.onreadystatechange = function() {
            console.log(`state: ${request.readyState}`);
            if (request.readyState == 4) resolve(request.responseText);
            if (request.status && request.status !== 200) {
                console.error(`Error on loading ${url}: ${request.status} - ${request.statusText}`);
                reject(request.status);
            }
        };
    });
}

function parseViewedMovies(doc) {
    const movies = [];
    var a = doc.querySelectorAll('div[style="margin-bottom:10px;margin-top: 10px;"]');
    if (!a || !a.length) {
        console.log('No movies found on the page.');
        return movies;
    }
    for (let i = 0; i < a.length; i++) {
        const element = a[i];
        var ruNameTag = element.querySelector('h2');
        if (!ruNameTag) continue;
        var movie_ru = ruNameTag.innerText.trim();
        var enNameTag = ruNameTag.nextSibling.nextSibling;
        let movie_en = '';
        if (enNameTag && enNameTag.tagName.toLowerCase() === 'div') {
            movie_en = enNameTag.innerText.trim();
        }
        var yearTags = element.querySelectorAll('div.small span.strong');
        var year = yearTags[0].innerText.match(/.*(\d{4}).*/)[1];
        var b = element.nextSibling.nextSibling.querySelector('span[style="font-weight:bold;"]');
        if (!b || !b.innerText) {
            console.log('No marks found on the page.');
            return;
        }
        var mark = b.innerText;
        var movie = {
            'ru': movie_ru,
            'en': movie_en,
            'year': year,
            'mark': mark,
        };
        movies.push(movie);
    }
    return movies;
}

function parsePagesCount() {
	var tuda = findElementByText('a.pag',"\u0442\u0443\u0434\u0430");
	if (!tuda || !tuda.length) tuda = findElementByText('a.pag2',"\u0442\u0443\u0434\u0430");
	if (!tuda || !tuda.length) tuda = findElementByText('span.pag',"\u0442\u0443\u0434\u0430");
	if (!tuda || !tuda.length) tuda = findElementByText('span.pag2',"\u0442\u0443\u0434\u0430");
	pages = (tuda
			 && tuda.length
			 && tuda[0]
		     && tuda[0].previousSibling
			 && tuda[0].previousSibling.previousSibling)
				? Number(tuda[0].previousSibling.previousSibling.innerText.trim())
				: 0;
				
	return pages;
}

function makeHttpObject() {
    try {return new XMLHttpRequest();}
    catch (error) {}
    try {return new ActiveXObject("Msxml2.XMLHTTP");}
    catch (error) {}
    try {return new ActiveXObject("Microsoft.XMLHTTP");}
    catch (error) {}

    throw new Error("Could not create HTTP request object.");
}
