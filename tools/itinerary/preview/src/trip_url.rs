use worker::Url;

/// Trip ids from Keeper of State: 14 characters from this alphabet.
const ID_ALPHABET: &str = "23456789bcdfghjkmnpqrstvwxz";
const ID_LENGTH: usize = 14;

const CARD_FILE: &str = "card.png";

/// A trip's address, split so the worker never assumes where the itinerary is mounted: the main worker
/// routes `<mount><id>` and `<mount><id>/card.png` here, from whatever prefix the tool was built with.
pub struct TripUrl {
    origin: String,
    host: String,
    mount: String,
    pub id: String,
}

impl TripUrl {
    /// `<mount><id>`, `<mount><id>/` or `<mount><id>/edit`, as the trip page is served.
    pub fn from_page(url: &Url) -> Option<TripUrl> {
        let path = url.path().trim_end_matches('/');
        let path = path.strip_suffix("/edit").unwrap_or(path);
        TripUrl::split(url, path)
    }

    /// `<mount><id>/card.png`.
    pub fn from_card(url: &Url) -> Option<TripUrl> {
        let path = url.path().strip_suffix(CARD_FILE)?.strip_suffix('/')?;
        TripUrl::split(url, path)
    }

    fn split(url: &Url, path: &str) -> Option<TripUrl> {
        let (mount, id) = path.rsplit_once('/')?;
        let valid = id.len() == ID_LENGTH && id.chars().all(|c| ID_ALPHABET.contains(c));
        valid.then(|| TripUrl {
            origin: url.origin().ascii_serialization(),
            host: url.host_str().map_or_else(String::new, |host| match url.port() {
                Some(port) => format!("{host}:{port}"),
                None => host.to_string(),
            }),
            mount: format!("{mount}/"),
            id: id.to_string(),
        })
    }

    pub fn page(&self) -> String {
        format!("{}{}{}", self.origin, self.mount, self.id)
    }

    /// The card for one version of the trip. A new version gets a new URL, so a cached card never goes stale.
    pub fn card(&self, version: &str) -> String {
        let mut url = Url::parse(&format!("{}/{CARD_FILE}", self.page())).expect("trip URL parses");
        url.query_pairs_mut().append_pair("v", version);
        url.into()
    }

    /// The page without its scheme, as printed on the card.
    pub fn display(&self) -> String {
        format!("{}{}{}", self.host, self.mount, self.id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(text: &str) -> Url {
        Url::parse(text).unwrap()
    }

    #[test]
    fn page_paths() {
        for path in ["/itinerary/3pwsf4hhwx5n6s", "/itinerary/3pwsf4hhwx5n6s/", "/itinerary/3pwsf4hhwx5n6s/edit"] {
            let trip = TripUrl::from_page(&url(&format!("https://tools.giodamelio.com{path}"))).unwrap();
            assert_eq!(trip.id, "3pwsf4hhwx5n6s");
            assert_eq!(trip.page(), "https://tools.giodamelio.com/itinerary/3pwsf4hhwx5n6s");
        }
    }

    #[test]
    fn card_path_and_versioned_url() {
        let trip = TripUrl::from_card(&url("http://localhost:8788/itinerary/3pwsf4hhwx5n6s/card.png?v=x")).unwrap();
        assert_eq!(trip.display(), "localhost:8788/itinerary/3pwsf4hhwx5n6s");
        assert_eq!(
            trip.card("2026-08-09T18:04:55Z"),
            "http://localhost:8788/itinerary/3pwsf4hhwx5n6s/card.png?v=2026-08-09T18%3A04%3A55Z"
        );
    }

    #[test]
    fn mount_comes_from_the_path() {
        let trip = TripUrl::from_page(&url("https://example.com/tools/trips/3pwsf4hhwx5n6s")).unwrap();
        assert_eq!(trip.display(), "example.com/tools/trips/3pwsf4hhwx5n6s");
    }

    #[test]
    fn rejects_anything_that_is_not_a_trip() {
        assert!(TripUrl::from_page(&url("https://x.dev/itinerary/")).is_none());
        assert!(TripUrl::from_page(&url("https://x.dev/itinerary/3pwsf4hhwx5n6a")).is_none());
        assert!(TripUrl::from_card(&url("https://x.dev/itinerary/3pwsf4hhwx5n6s/card.jpg")).is_none());
    }
}
